export interface DeviceFileReference {
	path: string;
	connectionId?: string;
}

const hasControl = (value: string) => /\p{Cc}/u.test(value);
const supportedPath = (path: string) =>
	path.length > 0 && path.length <= 4096 && !hasControl(path) && !path.split(/[/\\]/u).includes("..");

function filePath(raw: string): string | undefined {
	let value = raw.trim();
	for (const [open, close] of [
		["“", "”"],
		["‘", "’"],
		["'", "'"],
		['"', '"'],
	] as const) {
		if (value.startsWith(open) && value.endsWith(close)) value = value.slice(1, -1).trim();
	}
	value = value.replace(/^\\(?=~)/, "");
	const path = /^(?:[a-z]:[/\\]|~\\)/i.test(value) ? value.replaceAll("\\", "/") : value;
	if (!supportedPath(path) || path.startsWith("//")) return undefined;
	if (path !== "~" && !/^(?:~\/|[a-z]:\/|\/)/i.test(path)) return undefined;
	return path.replace(/\/{2,}/g, "/").replace(/(?:^|\/)\.\//g, (segment) => (segment.startsWith("/") ? "/" : ""));
}

export function plainDeviceFileReference(raw: string): DeviceFileReference | undefined {
	const path = filePath(raw);
	return path ? { path } : undefined;
}

export const deviceFileScheme = "yonder-file:";

export function linkedDeviceFileReference(target: string): DeviceFileReference | undefined {
	if (!target.startsWith(deviceFileScheme)) return undefined;
	const parts = target.slice(deviceFileScheme.length).split("/");
	if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
	try {
		const connectionId = decodeURIComponent(parts[0]);
		const path = decodeURIComponent(parts[1]);
		if (!/^[a-z0-9_-]{1,128}$/i.test(connectionId) || !supportedPath(path) || path.includes("://")) return undefined;
		return { connectionId, path: /^[a-z]:[/\\]/i.test(path) ? path.replaceAll("\\", "/") : path };
	} catch {
		return undefined;
	}
}

const quotedPath =
	/'([^'\n]{1,4096})'|"([^"\n]{1,4096})"|“([^”\n]{1,4096})”|‘([^’\n]{1,4096})’|(?<![\p{L}\p{N}_/])(\\?~\/[^\s'“”’"<>。；，、()]{1,4096})/gu;

export function quotedDeviceFiles(text: string) {
	return [...text.matchAll(quotedPath)].flatMap((match) => {
		const raw = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
		const reference = plainDeviceFileReference(raw);
		return reference ? [{ index: match.index, length: match[0].length, reference }] : [];
	});
}

export function deviceFileName(path: string): string {
	return (
		path
			.replace(/[/\\]$/u, "")
			.split(/[/\\]/u)
			.at(-1) || path
	);
}

export function deviceFileChild(path: string, name: string): string | undefined {
	if (!name || /[/\\]/u.test(name) || hasControl(name) || name === "." || name === "..") return undefined;
	if (path === ".") return name;
	if (path.startsWith("\\\\")) return `${path.replace(/\\$/u, "")}\\${name}`;
	return `${path.replace(/\/$/u, "")}/${name}`;
}
