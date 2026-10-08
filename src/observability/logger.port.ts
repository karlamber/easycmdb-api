/**
 * Port for structured logging. Implementations emit one JSON object per call.
 *
 * Levels:
 *   - debug: developer diagnostics, off by default in prod
 *   - info:  expected lifecycle/business events
 *   - warn:  recoverable anomalies (validation failed, 4xx)
 *   - error: operation failed with likely impact (5xx, infra failure)
 */
export type LogFields = Record<string, unknown>;

export type LoggerPort = {
	debug(message: string, fields?: LogFields): void;
	info(message: string, fields?: LogFields): void;
	warn(message: string, fields?: LogFields): void;
	/**
	 * Log an error. Pass an `Error` as the second argument to capture
	 * type/message/stack under an `err` field, or pass a plain fields object.
	 */
	error(
		message: string,
		errorOrFields?: Error | LogFields,
		fields?: LogFields,
	): void;
	/** Returns a logger that adds the given bindings to every entry. */
	child(bindings: LogFields): LoggerPort;
};
