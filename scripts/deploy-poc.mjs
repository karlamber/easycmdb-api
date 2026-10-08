import { access, readFile, stat } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const deployEnvFile = process.env.DEPLOY_ENV_FILE || '.env.deploy.poc';

async function fileExists(targetPath) {
	try {
		await access(targetPath, fsConstants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function stripInlineComment(value) {
	let inSingleQuote = false;
	let inDoubleQuote = false;

	for (let i = 0; i < value.length; i += 1) {
		const char = value[i];
		if (char === "'" && !inDoubleQuote) {
			inSingleQuote = !inSingleQuote;
		} else if (char === '"' && !inSingleQuote) {
			inDoubleQuote = !inDoubleQuote;
		} else if (char === '#' && !inSingleQuote && !inDoubleQuote) {
			return value.slice(0, i).trim();
		}
	}

	return value.trim();
}

async function loadEnvFileIfPresent(filePath) {
	if (!(await fileExists(filePath))) {
		return;
	}

	const contents = await readFile(filePath, 'utf8');
	for (const rawLine of contents.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}

		const equalIdx = line.indexOf('=');
		if (equalIdx === -1) {
			continue;
		}

		const key = line.slice(0, equalIdx).trim();
		if (!key || process.env[key] !== undefined) {
			continue;
		}

		let value = stripInlineComment(line.slice(equalIdx + 1).trim());
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		process.env[key] = value;
	}
}

function requireEnv(name) {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required deploy variable: ${name}`);
	}
	return value;
}

async function run(command, args, extraEnv = {}) {
	await new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: 'inherit',
			env: { ...process.env, ...extraEnv },
		});

		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					`Command failed (${command} ${args.join(' ')}), exit code ${code}`,
				),
			);
		});
	});
}

function buildAwsArgs(region, profile, args) {
	const result = [...args];
	if (region) {
		result.push('--region', region);
	}
	if (profile) {
		result.push('--profile', profile);
	}
	return result;
}

async function main() {
	await loadEnvFileIfPresent(path.resolve(rootDir, deployEnvFile));

	const region = process.env.POC_AWS_REGION?.trim() || 'us-east-1';
	const artifactProfile = requireEnv('POC_ARTIFACT_AWS_PROFILE');
	const lambdaProfile = requireEnv('POC_LAMBDA_AWS_PROFILE');
	const artifactBucket = requireEnv('POC_LAMBDA_ARTIFACT_BUCKET');
	const artifactKey = requireEnv('POC_LAMBDA_ARTIFACT_KEY');
	const functionName = requireEnv('POC_LAMBDA_FUNCTION_NAME');

	const skipBuild =
		process.env.POC_SKIP_BUILD === '1' ||
		process.env.POC_SKIP_BUILD === 'true';

	if (!skipBuild) {
		console.log('Building Lambda artifact (npm run zip)...');
		await run('npm', ['run', 'zip']);
	} else {
		console.log('Skipping build (POC_SKIP_BUILD set)');
	}

	const bundlePath = path.resolve(rootDir, 'bundle.zip');
	if (!(await fileExists(bundlePath))) {
		throw new Error(
			`Build artifact not found at ${bundlePath}. Did 'npm run zip' succeed?`,
		);
	}

	const bundleStat = await stat(bundlePath);
	console.log(
		`Built artifact: ${bundlePath} (${(bundleStat.size / 1024).toFixed(1)} KiB)`,
	);

	const s3Uri = `s3://${artifactBucket}/${artifactKey}`;
	console.log(
		`Uploading artifact -> ${s3Uri}  (profile: ${artifactProfile})`,
	);
	await run(
		'aws',
		buildAwsArgs(region, artifactProfile, ['s3', 'cp', bundlePath, s3Uri]),
	);

	console.log(
		`Updating Lambda function code: ${functionName}  (profile: ${lambdaProfile})`,
	);
	await run(
		'aws',
		buildAwsArgs(region, lambdaProfile, [
			'lambda',
			'update-function-code',
			'--function-name',
			functionName,
			'--s3-bucket',
			artifactBucket,
			'--s3-key',
			artifactKey,
		]),
	);

	console.log('Waiting for Lambda function to finish updating...');
	await run(
		'aws',
		buildAwsArgs(region, lambdaProfile, [
			'lambda',
			'wait',
			'function-updated',
			'--function-name',
			functionName,
		]),
	);

	console.log('POC Lambda deploy completed.');
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
