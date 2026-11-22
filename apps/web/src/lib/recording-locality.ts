const localityPattern = /^\p{L}[\p{L}\p{M}]*(?:[ \p{Pd}'’·・]\p{L}[\p{L}\p{M}]*)*$/u;

/** Validate the shape of an approved city label; the caller must supply only locality, never an address. */
export function normalizeRecordingLocality(value: string | undefined): string | undefined {
	const label = value?.trim().normalize("NFC").replace(/ +/g, " ");
	return label && [...label].length <= 48 && localityPattern.test(label) ? label : undefined;
}
