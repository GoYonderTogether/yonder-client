// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { expect, test } from "vitest";
import { type ModelSlot, saveMetadata } from "./provider-model-slots.ts";
import { ProviderModelSlots } from "./provider-model-slots.tsx";

const initial: ModelSlot[] = [
	{ key: "one", id: "m1", name: "First", contextLength: "4096", efforts: ["medium"] },
	{ key: "two", id: "m2", name: "Second", contextLength: "8192", efforts: [] },
];

function TestSlots() {
	const [slots, setSlots] = useState(initial);
	return (
		<>
			<ProviderModelSlots
				slots={slots}
				available={[]}
				disabled={false}
				errorOf={() => undefined}
				onChange={setSlots}
				onTest={() => {}}
				testing={null}
			/>
			<output aria-label="metadata">{JSON.stringify(saveMetadata(slots))}</output>
		</>
	);
}

test("choices stay open and scoped to their row, preserve order and omit empty effort metadata", () => {
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<TestSlots />
		</I18nextProvider>,
	);
	const [first, second] = screen.getAllByRole("button", { name: "Reasoning levels" });
	if (!first || !second) throw new Error("Two model slots expected");
	expect(first).toHaveTextContent("Medium");
	fireEvent.keyDown(first, { key: "ArrowDown" });
	const menu = screen.getByRole("menu", { name: "Reasoning levels" });
	const option = (level: string) => within(menu).getByRole("menuitemcheckbox", { name: level });
	expect(option("Off")).toHaveFocus();
	fireEvent.keyDown(option("Off"), { key: "ArrowDown" });
	expect(option("Low")).toHaveFocus();
	fireEvent.click(option("Low"));
	fireEvent.click(option("Max"));
	expect(option("Low")).toHaveAttribute("aria-checked", "true");
	expect(option("Max")).toHaveAttribute("aria-checked", "true");
	expect(first).toHaveAttribute("aria-expanded", "true");
	expect(second).not.toHaveTextContent("Low");
	const metadata = () => JSON.parse(screen.getByLabelText("metadata").textContent ?? "{}");
	expect(metadata()).toEqual({
		m1: { name: "First", contextLength: 4096, efforts: ["low", "medium", "max"] },
		m2: { name: "Second", contextLength: 8192 },
	});
	for (const level of ["Low", "Medium", "Max"]) fireEvent.click(option(level));
	expect(metadata().m1).toEqual({ name: "First", contextLength: 4096 });
	fireEvent.keyDown(option("Low"), { key: "Escape" });
	expect(first).toHaveFocus();
	expect(screen.queryByRole("menu")).toBeNull();
	fireEvent.click(second);
	fireEvent.pointerDown(document.body);
	expect(screen.queryByRole("menu")).toBeNull();
});
