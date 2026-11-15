const pages = new Set([
	"conversations",
	"chat",
	"me",
	"profile",
	"account",
	"contacts",
	"models",
	"quota",
	"devices",
	"skills",
	"invite",
	"legal",
]);
export function signInDestination(input?: string): string {
	if (!input) return "/pages/conversations/index";
	let value: string;
	try {
		value = decodeURIComponent(input);
	} catch {
		return "/pages/conversations/index";
	}
	const match = value.match(/^\/pages\/([a-z-]+)\/index(?:\?[^#]*)?$/);
	return match && pages.has(match[1]) && !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char === "\\")
		? value
		: "/pages/conversations/index";
}
