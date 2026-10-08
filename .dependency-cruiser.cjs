/**
 * dependency-cruiser configuration for argus-api-lambda.
 *
 * Enforces hexagonal/DDD layer boundaries:
 *   interfaces -> application -> domain
 *   infrastructure -> domain
 *
 * Run: npm run lint:arch
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
const {
	commonRules,
} = require('./fitness-functions-rules/architecture-rules/common.rules.cjs');
const {
	layerDependencyRules,
} = require('./fitness-functions-rules/architecture-rules/layer-dependencies.rules.cjs');

module.exports = {
	forbidden: [...commonRules, ...layerDependencyRules],
	options: {
		includeOnly: '^src',
		doNotFollow: {
			path: 'node_modules',
		},
		tsPreCompilationDeps: true,
		tsConfig: {
			fileName: './tsconfig.json',
		},
	},
};
