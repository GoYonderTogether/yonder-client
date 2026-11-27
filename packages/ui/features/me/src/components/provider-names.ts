import type { ProviderModelMetadata } from "@yonder/protocol";

/** An address without its trailing slashes, for comparing two spellings of one place. */
export function normalise(value: string): string {
	return value.trim().replace(/\/+$/, "");
}

/** Display names from the metadata map, so a slot can show one without the rest of the row. */
export function namesFrom(
	metadata: Record<string, ProviderModelMetadata> | undefined,
): Record<string, string> | undefined {
	if (!metadata) return undefined;
	const names = Object.fromEntries(
		Object.entries(metadata)
			.filter(([, item]) => item.name)
			.map(([id, item]) => [id, item.name as string]),
	);
	return Object.keys(names).length ? names : undefined;
}
