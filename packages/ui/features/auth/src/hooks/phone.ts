/**
 * Phone number handling on the client: what the user types, what is sent, and what is shown back.
 * The server normalises too; this exists so the request is right the first time and the field can
 * say what is wrong before a round trip.
 */
export interface CountryCode {
	code: string;
	label: string;
}

/** The codes offered in the picker. A full list is a data problem, not a UI one; these cover the
 * first release's users, and the number itself is still validated server-side. */
export const COUNTRY_CODES: readonly CountryCode[] = [
	{ code: "+86", label: "中国 +86" },
	{ code: "+852", label: "香港 +852" },
	{ code: "+853", label: "澳门 +853" },
	{ code: "+886", label: "台灣 +886" },
	{ code: "+1", label: "US +1" },
	{ code: "+44", label: "UK +44" },
	{ code: "+81", label: "日本 +81" },
	{ code: "+65", label: "Singapore +65" },
];

export const DEFAULT_COUNTRY_CODE = "+86";

/**
 * Strip what people type — spaces, dashes, parentheses — and join the country code. A number that
 * already starts with `+` is taken as-is, so pasting a full number works.
 */
export function toE164(countryCode: string, input: string): string {
	const trimmed = input.trim();
	if (trimmed.startsWith("+")) return trimmed.replace(/[\s()-]/g, "");
	const digits = trimmed.replace(/[\s()-]/g, "").replace(/^0+/, "");
	return `${countryCode}${digits}`;
}

/** The same E.164 rule the server enforces, so the field can fail fast. */
export function isValidE164(value: string): boolean {
	return /^\+[1-9]\d{7,14}$/.test(value);
}

/** `138 0013 8000` for a mainland number: three, four, four. */
export function formatNational(input: string): string {
	const digits = input.replace(/\D/g, "");
	if (digits.length <= 3) return digits;
	if (digits.length <= 7) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
	return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7, 11)}`;
}
