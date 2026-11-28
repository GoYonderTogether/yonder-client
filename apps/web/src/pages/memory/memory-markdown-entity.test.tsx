// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { MemoryFileContent } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import { MemoryMarkdown } from "./memory-markdown.tsx";

/**
 * A person written as `[名字](entity:ent_…)` in a file body (02 链接 关系网) is a link to that entity's
 * page, not plain text: the Markdown renderer keeps the scheme and `MemoryMarkdown` draws the entity
 * link. A link to an unknown path stays plain, as before.
 */
const profile = vi.hoisted(() => ({
	data: {
		id: "ent_0123456789ABCDEFGHJKMNPQRS",
		type: "person" as const,
		name: "刀哥",
		path: "/people/刀哥.md",
		avatar: { kind: "initial" as const },
	},
}));
vi.mock("@yonder/ui-data", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@yonder/ui-data")>();
	return { ...actual, useEntityProfile: () => ({ data: profile.data }) };
});
vi.mock("../../preview/use-attachment-blob.ts", () => ({
	useAttachmentBlob: () => ({ blob: undefined, load: async () => undefined }),
}));
vi.mock("../../lib/use-object-url.ts", () => ({ useObjectUrl: () => undefined }));

const file = (content: string): MemoryFileContent => ({
	path: "/people/李四.md",
	title: "李四",
	kind: "note",
	visibility: "private",
	updatedAt: "2026-11-28T00:00:00Z",
	updatedBy: "user",
	updatedByName: null,
	userEdited: false,
	draft: false,
	content,
	version: 1,
	sources: [],
	limit: { length: 65536, unit: "bytes" },
	links: [],
});

function show(content: string) {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<MemoryRouter>
				<MemoryMarkdown file={file(content)} onOpen={() => {}} />
			</MemoryRouter>
		</I18nextProvider>,
	);
}

test("an entity link in a body opens that entity's page and keeps its name", () => {
	show("关系网\n\n- [刀哥](entity:ent_0123456789ABCDEFGHJKMNPQRS)");
	const link = screen.getByRole("button", { name: "Open 刀哥" });
	expect(link).toBeVisible();
	expect(link).toHaveTextContent("刀哥");
});

test("an entity link to another person is still an entity link; an unknown-file link stays plain", () => {
	show("[李四](unknown:path.md) 和 [刀哥](entity:ent_0123456789ABCDEFGHJKMNPQRS)");
	expect(screen.getByRole("button", { name: "Open 刀哥" })).toBeVisible();
	// There is no button for the unknown-file link, so it renders as plain words.
	expect(screen.queryByRole("button", { name: "李四" })).toBeNull();
	expect(screen.getByText("李四")).toBeVisible();
});

test("a person's head and contact marker are not drawn; the reach block and material index are", () => {
	const body = [
		"---",
		"id: ent_0123456789ABCDEFGHJKMNPQRS",
		"type: person",
		"aliases: [刀哥]",
		"---",
		"刀哥（合作伙伴）",
		"",
		"## 触达方式",
		"- Yonder：@wubingqi",
		"",
		"## 资料索引",
		"- 渠道会话：3 条，最近 11 月 26 日",
		"",
		"<!-- contact-member: mem_zhang -->",
	].join("\n");
	show(body);
	// The head is metadata, not body text.
	expect(screen.queryByText(/aliases/)).toBeNull();
	expect(screen.queryByText(/contact-member/)).toBeNull();
	// The reach block and the material index render as their headings and lines.
	expect(screen.getByText("触达方式")).toBeVisible();
	expect(screen.getByText(/@wubingqi/)).toBeVisible();
	expect(screen.getByText("资料索引")).toBeVisible();
	expect(screen.getByText(/渠道会话/)).toBeVisible();
});
