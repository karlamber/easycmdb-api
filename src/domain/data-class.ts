export const DATA_CLASSES = [
	'PUBLIC',
	'INTERNAL',
	'CONFIDENTIAL',
	'RESTRICTED',
] as const;

export type DataClass = (typeof DATA_CLASSES)[number];
