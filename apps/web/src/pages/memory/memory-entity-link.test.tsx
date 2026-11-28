// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { EntityProfile } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { EntityLink, entityIdOf } from "./memory-entity-link.tsx";

/**
 * `entity:<id>` links (02 链接): the id is read from the link target, the profile decides the name and
 * the picture, and the link opens the entity's page in the existing file pane — a person page is a
 * memory file, so no page of its own is added. The route the link goes to is the app's own.
 */
const data = vi.hoisted(() => ({ profile: undefined as EntityProfile | undefined, error: null as Error | null }));
vi.mock("@yonder/ui-data", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@yonder/ui-data")>();
	return {
		...actual,
		useEntityProfile: () => ({ data: data.profile, error: data.error, isPending: false }),
	};
});
// The picture of a member or an asset goes through the attachment cache; this test checks the link.
vi.mock("../../preview/use-attachment-blob.ts", () => ({
	useAttachmentBlob: () => ({ blob: undefined, load: async () => undefined, loading: false, error: false }),
}));
vi.mock("../../lib/use-object-url.ts", () => ({ useObjectUrl: () => undefined }));

let path = "";
function Where() {
	path = useLocation().pathname;
	return null;
}

function show(node: React.ReactNode) {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<MemoryRouter initialEntries={["/memory"]}>
				{node}
				<Where />
			</MemoryRouter>
		</I18nextProvider>,
	);
}

beforeEach(() => {
	data.profile = undefined;
	data.error = null;
	path = "";
});

test("only a well-formed entity target is an entity link", () => {
	expect(entityIdOf("entity:ent_0123456789ABCDEFGHJKMNPQRS")).toBe("ent_0123456789ABCDEFGHJKMNPQRS");
	expect(entityIdOf(" entity:ent_0123456789ABCDEFGHJKMNPQRS ")).toBe("ent_0123456789ABCDEFGHJKMNPQRS");
	expect(entityIdOf("mem_0123456789ABCDEFGHJKMNPQRS")).toBeNull();
	expect(entityIdOf("entity:ent_short")).toBeNull();
	expect(entityIdOf("/people/刀哥.md")).toBeNull();
});

test("without a profile the link's own words stay, and nothing is clickable", () => {
	show(<EntityLink id="ent_0123456789ABCDEFGHJKMNPQRS" text="刀哥" />);
	expect(screen.getByText("刀哥")).toBeVisible();
	expect(screen.queryByRole("button")).toBeNull();
});

test("a person with a member picture shows it and opens their page", () => {
	data.profile = {
		id: "ent_0123456789ABCDEFGHJKMNPQRS",
		type: "person",
		name: "刀哥",
		path: "/people/刀哥.md",
		avatar: { kind: "member", url: "https://avatar.test/files/avatars/abc" },
	};
	show(<EntityLink id="ent_0123456789ABCDEFGHJKMNPQRS" text="刀哥" />);
	const link = screen.getByRole("button", { name: "Open 刀哥" });
	// The profile's name wins over the link's words: the page may have been renamed.
	expect(link).toHaveTextContent("刀哥");
	fireEvent.click(link);
	expect(path).toBe(`/memory/files/${encodeURIComponent("/people/刀哥.md")}`);
});

test("a person with no picture shows the name's first character, never a brand", () => {
	data.profile = {
		id: "ent_0123456789ABCDEFGHJKMNPQRS",
		type: "person",
		name: "刀哥",
		path: "/people/刀哥.md",
		avatar: { kind: "initial" },
	};
	show(<EntityLink id="ent_0123456789ABCDEFGHJKMNPQRS" text="刀哥" />);
	const link = screen.getByRole("button", { name: "Open 刀哥" });
	// The initial tile is decorative inside the link, so the link still reads as its name.
	expect(link).toHaveTextContent("刀");
});

test("an organisation with a brand draws its official icon", () => {
	data.profile = {
		id: "ent_0123456789ABCDEFGHJKMNPQRS",
		type: "org",
		name: "星光创客",
		path: "/projects/星光创客.md",
		avatar: { kind: "brand", brand: "wechat" },
	};
	show(<EntityLink id="ent_0123456789ABCDEFGHJKMNPQRS" text="星光创客" />);
	// The bundled icon is the registry brand's own file; it stays decorative, so the link reads by name.
	const icon = document.querySelector(".memory-entity-link img");
	expect(icon?.getAttribute("src")).toContain("wechat.png");
});
