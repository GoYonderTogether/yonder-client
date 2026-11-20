// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { OutwardRequestCard } from "./outward-request-card.tsx";

const mutate = vi.fn();
vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	useOutwardActions: () => ({ ask: {}, act: { mutate, isPending: false, data: undefined, error: null } }),
}));

test("a visitor cancels a waiting request only after a second, inline confirmation", () => {
	const { getByText, queryByText } = render(
		<I18nextProvider i18n={createI18n("zh-CN")}>
			<OutwardRequestCard
				card={{ id: "owr_1", state: "open", expiresAt: "2026-11-21T00:00:00Z" }}
				conversationId="cnv_1"
				canCancel
			/>
		</I18nextProvider>,
	);
	fireEvent.click(getByText("取消请求"));
	expect(mutate).not.toHaveBeenCalled();
	expect(getByText("取消后主人将看不到这个请求。")).toBeTruthy();
	fireEvent.click(getByText("保留"));
	expect(queryByText("确认取消")).toBeNull();
	fireEvent.click(getByText("取消请求"));
	fireEvent.click(getByText("确认取消"));
	expect(mutate).toHaveBeenCalledWith({ id: "owr_1", input: { action: "cancel" } });
});
