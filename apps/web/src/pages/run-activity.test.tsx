// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test } from "vitest";
import { RunActivity } from "./run-activity.tsx";

test("activity exposes named source links only when expanded", () => {
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<RunActivity
				run={{
					id: "r",
					conversationId: "c",
					messageId: "m",
					userMessageId: "u",
					status: "running",
					activity: [
						{
							label: "搜索：日期",
							sources: [{ title: "Source title", url: "https://example.org/a", site: "example.org" }],
						},
					],
				}}
			/>
		</I18nextProvider>,
	);
	const button = screen.getByRole("button", { name: /搜索：日期/ });
	expect(button).toHaveAttribute("aria-expanded", "false");
	fireEvent.click(button);
	expect(button).toHaveAttribute("aria-expanded", "true");
	expect(screen.getByRole("link", { name: "example.org" })).toHaveAttribute("rel", "noopener noreferrer");
});
