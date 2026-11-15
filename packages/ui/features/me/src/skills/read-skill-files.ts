/** A directory upload preserves supporting paths; a plain file upload uses the file names. */
export async function readSkillFiles(selected: readonly File[]): Promise<Record<string, string>> {
	if (!selected.length || selected.length > 32 || selected.reduce((size, file) => size + file.size, 0) > 512 * 1024)
		throw new Error("skill_file_limit");
	const paths = selected.map((file) => file.webkitRelativePath || file.name);
	const root = paths[0]?.split("/")[0];
	const stripRoot = paths.every((path) => path.includes("/") && path.split("/")[0] === root);
	const entries = await Promise.all(
		selected.map(async (file) => {
			const raw = file.webkitRelativePath || file.name;
			const path = stripRoot ? raw.slice(raw.indexOf("/") + 1) : raw;
			if (
				file.size > 128 * 1024 ||
				path.includes("\\") ||
				path.split("/").some((part) => !part || part === "." || part === "..")
			)
				throw new Error("skill_file_limit");
			const content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
			if (content.includes("\0")) throw new Error("skill_binary_file");
			return [path, content] as const;
		}),
	);
	const files = Object.fromEntries(entries);
	if (!Object.hasOwn(files, "SKILL.md") || Object.keys(files).length !== selected.length)
		throw new Error("skill_files_invalid");
	return files;
}
