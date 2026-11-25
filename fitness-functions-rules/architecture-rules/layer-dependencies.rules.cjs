/**
 * Layer Dependency Rules
 *
 * Enforces hexagonal/DDD layer boundaries in argus-api-lambda. Dependencies
 * must point inward toward the domain:
 *
 *   interfaces -> application -> domain
 *   infrastructure -> domain
 *
 * Forbidden:
 *   - domain depending on application, infrastructure, or interfaces
 *   - application depending on infrastructure or interfaces
 *   - infrastructure depending on application or interfaces
 *
 * The handler.ts at the root of src/ is the composition root and is allowed
 * to depend on every layer (it wires concrete adapters into application
 * services).
 *
 * @type {import('dependency-cruiser').IForbiddenRuleType[]}
 */
const layerDependencyRules = [
	{
		name: 'domain-no-application',
		comment:
			'Domain must not depend on the application layer. Use plain domain types/ports.',
		severity: 'error',
		from: { path: '^src/domain' },
		to: { path: '^src/application' },
	},
	{
		name: 'domain-no-infrastructure',
		comment:
			'Domain must not depend on infrastructure. Define ports (interfaces) in domain and have infrastructure implement them.',
		severity: 'error',
		from: { path: '^src/domain' },
		to: { path: '^src/infrastructure' },
	},
	{
		name: 'domain-no-interfaces',
		comment: 'Domain must not depend on the interfaces (delivery) layer.',
		severity: 'error',
		from: { path: '^src/domain' },
		to: { path: '^src/interfaces' },
	},
	{
		name: 'application-no-infrastructure',
		comment:
			'Application services must not depend on infrastructure. Inject repository ports (defined in domain) instead.',
		severity: 'error',
		from: { path: '^src/application' },
		to: { path: '^src/infrastructure' },
	},
	{
		name: 'application-no-interfaces',
		comment:
			'Application services must not depend on the interfaces (delivery) layer.',
		severity: 'error',
		from: { path: '^src/application' },
		to: { path: '^src/interfaces' },
	},
	{
		name: 'infrastructure-no-application',
		comment: 'Infrastructure must not depend on the application layer.',
		severity: 'error',
		from: { path: '^src/infrastructure' },
		to: { path: '^src/application' },
	},
	{
		name: 'infrastructure-no-interfaces',
		comment:
			'Infrastructure must not depend on the interfaces (delivery) layer.',
		severity: 'error',
		from: { path: '^src/infrastructure' },
		to: { path: '^src/interfaces' },
	},
];

module.exports = { layerDependencyRules };
