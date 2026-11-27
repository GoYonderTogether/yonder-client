import { expect, test } from "vitest";
import {
	deviceFileChild,
	linkedDeviceFileReference,
	plainDeviceFileReference,
	quotedDeviceFiles,
} from "./device-file-reference.ts";

test("recognizes pasted device paths and explicit scoped references without traversal", () => {
	const path = "~/Documents/点石创校-口播/口播稿 v2.md";
	expect(quotedDeviceFiles(`试试 “'\\${path}'”`)[0]?.reference).toEqual({ path });
	expect(plainDeviceFileReference("C:\\Work\\release.md")).toEqual({ path: "C:/Work/release.md" });
	expect(linkedDeviceFileReference(`yonder-file:con_a/${encodeURIComponent("docs/发布.md")}`)).toEqual({
		connectionId: "con_a",
		path: "docs/发布.md",
	});
	expect(plainDeviceFileReference("file:///etc/passwd")).toBeUndefined();
	expect(linkedDeviceFileReference(`yonder-file:con_a/${encodeURIComponent("../secret")}`)).toBeUndefined();
	expect(linkedDeviceFileReference(`yonder-file:con_a/${encodeURIComponent(" docs/发布 .md ")}`)?.path).toBe(
		" docs/发布 .md ",
	);
	expect(deviceFileChild(path, "../secret")).toBeUndefined();
	expect(deviceFileChild(".", "发布.md")).toBe("发布.md");
});
