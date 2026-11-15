// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ChunkBoundary } from "./chunk-boundary.tsx";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function Broken(): never {
	throw new Error("chunk failed");
}

test("a failed view preserves the draft and asks before reloading", () => {
	const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
	const report = vi.spyOn(console, "error").mockImplementation(() => {});
	const { rerender } = render(
		<>
			<input aria-label="draft" defaultValue="unsent" />
			<ChunkBoundary resetKey="one">
				<Broken />
			</ChunkBoundary>
		</>,
	);
	expect(screen.getByRole("alert")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "app.reload" }));
	expect(confirm).toHaveBeenCalledWith("app.reloadConfirm");
	expect(screen.getByLabelText("draft")).toHaveValue("unsent");
	rerender(
		<>
			<input aria-label="draft" defaultValue="unsent" />
			<ChunkBoundary resetKey="two">
				<span>Recovered</span>
			</ChunkBoundary>
		</>,
	);
	expect(screen.getByText("Recovered")).toBeInTheDocument();
	confirm.mockRestore();
	report.mockRestore();
});
