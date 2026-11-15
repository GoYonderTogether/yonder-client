import { expect, test } from "vitest";
import { readSkillFiles } from "./read-skill-files.ts";

function file(path: string, text: string | Uint8Array): File {
	const bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;
	return {
		name: path.split("/").at(-1) ?? "",
		webkitRelativePath: path.includes("/") ? path : "",
		size: bytes.byteLength,
		arrayBuffer: async () => bytes.buffer,
	} as File;
}

test("folder imports retain supporting paths and remove only the selected root", async () => {
	expect(
		await readSkillFiles([
			file("notes/SKILL.md", "---\nname: notes\ndescription: 提取记录\n---\nRead references/guide.md."),
			file("notes/references/guide.md", "Only include confirmed facts."),
		]),
	).toEqual({
		"SKILL.md": "---\nname: notes\ndescription: 提取记录\n---\nRead references/guide.md.",
		"references/guide.md": "Only include confirmed facts.",
	});
	expect(await readSkillFiles([file("SKILL.md", "instructions")])).toEqual({ "SKILL.md": "instructions" });
});

test("a bundle is rejected as a whole for binary, duplicate, unsafe, missing or oversized files", async () => {
	const skill = file("SKILL.md", "instructions");
	for (const invalid of [
		[skill, file("image.png", new Uint8Array([137, 80, 78, 71]))],
		[skill, file("null.txt", "binary\0payload")],
		[skill, skill],
		[skill, file("../outside.txt", "outside")],
		[file("guide.md", "no entry")],
		[skill, file("big.txt", "x".repeat(128 * 1024 + 1))],
		Array.from({ length: 33 }, () => skill),
	]) {
		await expect(readSkillFiles(invalid)).rejects.toThrow();
	}
});
