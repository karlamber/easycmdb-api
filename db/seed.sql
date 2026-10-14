-- Demo inventory for local screenshots. Safe to re-run.
-- Account numbers are placeholders. Hosting providers come from db/bootstrap.sql.

INSERT INTO argus.application (
	app_alias,
	business_name,
	description,
	data_class,
	compliance,
	business_contact,
	development_contact,
	support_contact,
	source_repository,
	prod_url,
	runbook_url,
	created_by
)
SELECT
	v.app_alias,
	v.business_name,
	v.description,
	v.data_class,
	v.compliance,
	v.business_contact,
	v.development_contact,
	v.support_contact,
	v.source_repository,
	v.prod_url,
	v.runbook_url,
	'seed'
FROM (
	VALUES
		(
			'argus',
			'easyCMDB',
			'Configuration inventory of applications, landscapes, environments, and resources.',
			'INTERNAL',
			ARRAY['SOC2']::text[],
			'inventory@example.com',
			'platform@example.com',
			'support@example.com',
			'https://github.com/karlamber/easycmdb-api',
			'https://easycmdb.example.com',
			'https://example.com/runbooks/easycmdb'
		),
		(
			'hebe',
			'Hebe',
			'Public status and catalog site for the lab landscapes.',
			'PUBLIC',
			ARRAY[]::text[],
			'catalog@example.com',
			'web@example.com',
			'support@example.com',
			'https://github.com/example/hebe',
			'https://hebe.example.com',
			'https://example.com/runbooks/hebe'
		),
		(
			'apollo',
			'Apollo',
			'Container API and its Postgres database.',
			'CONFIDENTIAL',
			ARRAY['PII', 'SOC2']::text[],
			'apps@example.com',
			'api@example.com',
			'support@example.com',
			'https://github.com/example/apollo',
			'https://apollo.example.com',
			'https://example.com/runbooks/apollo'
		)
) AS v (
	app_alias,
	business_name,
	description,
	data_class,
	compliance,
	business_contact,
	development_contact,
	support_contact,
	source_repository,
	prod_url,
	runbook_url
)
WHERE NOT EXISTS (
	SELECT 1 FROM argus.application a WHERE a.app_alias = v.app_alias
);

INSERT INTO argus.landscape (
	name,
	description,
	organization,
	devops_contact,
	data_class,
	runbook_url,
	iac_repository,
	created_by
)
SELECT
	v.name,
	v.description,
	v.organization,
	v.devops_contact,
	v.data_class,
	v.runbook_url,
	v.iac_repository,
	'seed'
FROM (
	VALUES
		(
			'delphi',
			'Primary AWS landscape for the easyCMDB lab.',
			'fifty9',
			'devops@example.com',
			'INTERNAL',
			'https://example.com/runbooks/delphi',
			'https://github.com/karlamber/aws-delphi'
		),
		(
			'kos',
			'Python-orchestrated mirror of the same AWS shape.',
			'fifty9',
			'devops@example.com',
			'INTERNAL',
			'https://example.com/runbooks/kos',
			'https://github.com/karlamber/aws-kos'
		)
) AS v (
	name,
	description,
	organization,
	devops_contact,
	data_class,
	runbook_url,
	iac_repository
)
WHERE NOT EXISTS (
	SELECT 1 FROM argus.landscape l WHERE l.name = v.name
);

INSERT INTO argus.landscape_environment (
	landscape_id,
	environment_name,
	hosting_provider,
	provider_account_name,
	provider_account_number,
	direct_link,
	created_by
)
SELECT
	l.id,
	v.environment_name,
	v.hosting_provider,
	v.provider_account_name,
	v.provider_account_number,
	v.direct_link,
	'seed'
FROM (
	VALUES
		('delphi', 'dev', 'AWS', 'aws-delphi-dev', '000000000001', 'https://us-east-1.console.aws.amazon.com'),
		('delphi', 'prod', 'AWS', 'aws-delphi-prod', '000000000002', 'https://us-east-1.console.aws.amazon.com'),
		('kos', 'dev', 'AWS', 'aws-kos-dev', '000000000003', 'https://us-east-1.console.aws.amazon.com')
) AS v (
	landscape_name,
	environment_name,
	hosting_provider,
	provider_account_name,
	provider_account_number,
	direct_link
)
JOIN argus.landscape l ON l.name = v.landscape_name
WHERE NOT EXISTS (
	SELECT 1
	FROM argus.landscape_environment e
	WHERE e.landscape_id = l.id
		AND e.environment_name = v.environment_name
);

INSERT INTO argus.resource (
	landscape_id,
	landscape_environment_id,
	application_id,
	resource_scope,
	name,
	description,
	region,
	service,
	resource_type,
	provider_resource_id,
	created_by
)
SELECT
	l.id,
	e.id,
	a.id,
	v.resource_scope,
	v.name,
	v.description,
	v.region,
	v.service,
	v.resource_type,
	v.provider_resource_id,
	'seed'
FROM (
	VALUES
		(
			'delphi', 'dev', 'argus', 'APPLICATION',
			'easycmdb-api',
			'Inventory API Lambda.',
			'us-east-1', 'lambda', 'function',
			'arn:aws:lambda:us-east-1:000000000001:function:easycmdb-api'
		),
		(
			'delphi', 'dev', 'argus', 'APPLICATION',
			'easycmdb-db',
			'Aurora PostgreSQL cluster for the inventory.',
			'us-east-1', 'rds', 'cluster',
			'arn:aws:rds:us-east-1:000000000001:cluster:easycmdb'
		),
		(
			'delphi', 'dev', NULL, 'ENVIRONMENT',
			'easycmdb-web',
			'CloudFront distribution for the SPA.',
			'us-east-1', 'cloudfront', 'distribution',
			'arn:aws:cloudfront::000000000001:distribution/ELOCALDEMO001'
		),
		(
			'delphi', 'prod', 'argus', 'APPLICATION',
			'easycmdb-api',
			'Inventory API Lambda.',
			'us-east-1', 'lambda', 'function',
			'arn:aws:lambda:us-east-1:000000000002:function:easycmdb-api'
		),
		(
			'kos', 'dev', 'apollo', 'APPLICATION',
			'apollo-api',
			'Container API for Apollo.',
			'us-east-1', 'ecs', 'service',
			'arn:aws:ecs:us-east-1:000000000003:service/apollo/apollo-api'
		),
		(
			'kos', 'dev', 'hebe', 'APPLICATION',
			'hebe-web',
			'S3 origin for the Hebe site.',
			'us-east-1', 's3', 'bucket',
			'arn:aws:s3:::hebe-web-local-demo'
		)
) AS v (
	landscape_name,
	environment_name,
	app_alias,
	resource_scope,
	name,
	description,
	region,
	service,
	resource_type,
	provider_resource_id
)
JOIN argus.landscape l ON l.name = v.landscape_name
JOIN argus.landscape_environment e
	ON e.landscape_id = l.id
	AND e.environment_name = v.environment_name
LEFT JOIN argus.application a ON a.app_alias = v.app_alias
WHERE NOT EXISTS (
	SELECT 1
	FROM argus.resource r
	WHERE r.landscape_environment_id = e.id
		AND r.provider_resource_id = v.provider_resource_id
);
