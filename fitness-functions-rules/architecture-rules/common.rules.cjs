/**
 * Common Dependency Cruiser Rules
 *
 * Cross-cutting checks that apply regardless of layer:
 *   - no orphan modules (files no other module imports)
 *   - no circular dependencies
 *
 * The lambda composition root (src/handler.ts) is exempt from the orphan
 * check because it is the AWS Lambda entry point — nothing inside src/
 * imports it; AWS invokes it from outside.
 *
 * @type {import('dependency-cruiser').IForbiddenRuleType[]}
 */
const commonRules = [
	{
		name: 'no-orphans',
		severity: 'error',
		comment:
			'Modules without any incoming dependency are usually dead code. Exempt: handler.ts (lambda entry), spec/test files.',
		from: {
			path: '^src/.+',
			orphan: true,
			pathNot: '(^src/handler\\.ts$|__specs__|__tests__|\\.spec\\.ts$)',
		},
		to: {},
	},
	{
		name: 'no-circular',
		severity: 'error',
		comment:
			'Circular dependencies indicate tangled responsibilities. Refactor so dependencies form a DAG.',
		from: {},
		to: { circular: true },
	},
];

module.exports = { commonRules };
