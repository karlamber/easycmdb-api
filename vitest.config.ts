import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/__tests__/**/*.test.ts'],
		// pg connections + the Postgres pool import path require a DB to even
		// load. Tests use dynamic mocks where needed; this just keeps the
		// default discovery scoped to the colocated __tests__ folders.
		clearMocks: true,
	},
});
