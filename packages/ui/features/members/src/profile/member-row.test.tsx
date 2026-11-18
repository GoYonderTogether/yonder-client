// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { MemberHeader } from "./member-header.tsx";
import { MemberRow } from "./member-row.tsx";

const localised = (child: React.ReactNode) => <I18nextProvider i18n={createI18n("en")}>{child}</I18nextProvider>;

const chip = { kind: "person" as const, handle: "abcd1234", displayName: "A person", avatarUrl: null };

test("a person's row shows the public handle", () => {
	render(localised(<MemberRow member={chip} />));
	expect(screen.getByText("A person")).toBeVisible();
	expect(screen.getByText("@abcd1234")).toBeVisible();
});

test("a Bot's row names its owner instead of the handle, in both languages", () => {
	const bot = { ...chip, kind: "bot" as const, displayName: "Helper" };
	const view = render(localised(<MemberRow member={bot} ownerName="The owner" />));
	expect(screen.getByText("The owner's Bot")).toBeVisible();
	view.rerender(
		<I18nextProvider i18n={createI18n("zh-CN")}>
			<MemberRow member={bot} ownerName="张三" />
		</I18nextProvider>,
	);
	expect(screen.getByText("张三 的 Bot")).toBeVisible();
});

test("a Bot without a visible owner falls back to its handle rather than an empty line", () => {
	render(localised(<MemberRow member={{ ...chip, kind: "bot", displayName: "Helper" }} />));
	expect(screen.getByText("@abcd1234")).toBeVisible();
});

test("a row opens only when the caller gives it somewhere to go", async () => {
	const onOpen = vi.fn();
	const view = render(localised(<MemberRow member={chip} onOpen={onOpen} />));
	await userEvent.click(screen.getByRole("button", { name: /A person/ }));
	expect(onOpen).toHaveBeenCalledTimes(1);
	view.rerender(localised(<MemberRow member={chip} />));
	expect(screen.queryByRole("button", { name: /A person/ })).toBeNull();
});

test("the header shows name, handle and bio, and the Bot's owner line is tappable", async () => {
	const onOpenOwner = vi.fn();
	render(
		localised(
			<MemberHeader
				card={{
					kind: "bot",
					handle: "bot12345",
					displayName: "Helper",
					avatarUrl: null,
					bio: "Answers questions",
					owner: { handle: "ownerhandle", displayName: "The owner" },
				}}
				onOpenOwner={onOpenOwner}
			/>,
		),
	);
	expect(screen.getByRole("heading", { name: "Helper" })).toBeVisible();
	expect(screen.getByText("@bot12345")).toBeVisible();
	expect(screen.getByText("Answers questions")).toBeVisible();
	await userEvent.click(screen.getByRole("button", { name: "The owner's Bot" }));
	expect(onOpenOwner).toHaveBeenCalledWith("ownerhandle");
});

test("the header has no bio line when there is no bio", () => {
	const { container } = render(localised(<MemberHeader card={{ ...chip, bio: null, owner: null }} />));
	expect(container.querySelectorAll("p")).toHaveLength(1);
});
