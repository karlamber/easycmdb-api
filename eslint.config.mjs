import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: [
			'dist/**',
			'node_modules/**',
			'.github/**',
			'bundle.zip',
			'*.zip',
		],
	},
	{ files: ['**/*.{js,mjs,cjs,ts}'] },
	{
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
	pluginJs.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.cjs', 'scripts/**/*.{mjs,js}'],
		languageOptions: {
			globals: {
				...globals.node,
				module: true,
				require: true,
				__dirname: true,
				process: true,
			},
		},
		rules: {
			'no-undef': 'off',
			'@typescript-eslint/no-require-imports': 'off',
		},
	},
];
