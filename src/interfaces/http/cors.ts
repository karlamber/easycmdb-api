import type { AppConfig } from '../../config.js';

function parseAllowlist(raw: string | undefined): string[] {
	if (!raw) return [];
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export function corsHeaders(
	config: AppConfig,
	requestOrigin: string | undefined,
): Record<string, string> {
	const allowed = parseAllowlist(config.CORS_ORIGIN);
	const match =
		requestOrigin && allowed.includes(requestOrigin)
			? requestOrigin
			: undefined;

	// Always advertise the methods/headers the API supports plus Vary: Origin
	// (the response genuinely varies per-origin now that we reflect a matched
	// entry instead of a hardcoded value). Allow-Origin is only set when the
	// request's Origin matches the configured allowlist - this is what makes
	// the browser block disallowed origins instead of trusting them.
	const headers: Record<string, string> = {
		'Access-Control-Allow-Headers': 'Authorization, Content-Type',
		'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
		Vary: 'Origin',
	};

	if (match) {
		headers['Access-Control-Allow-Origin'] = match;
		headers['Access-Control-Allow-Credentials'] = 'true';
	}

	return headers;
}
