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
	{ key: "one", id: "m1", name: "First", contextLength: "4096", maxOutput: "", efforts: ["medium"] },
	{ key: "two", id: "m2", name: "Second", contextLength: "8K", maxOutput: "4K", efforts: [] },
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
				onFetch={() => {}}
				onOpenPicker={() => {}}
				fetching={false}
				canFetch
			/>
			<output aria-label="metadata">{JSON.stringify(saveMetadata(slots))}</output>
		</>
	);
}

test.each([
	["en", "Reasoning levels"],
	["zh-CN", "思考档位"],
] as const)("raw effort codes in %s stay scoped to their row and preserve the saved values", (locale, label) => {
	render(
		<I18nextProvider i18n={createI18n(locale)}>
			<TestSlots />
		</I18nextProvider>,
	);
	const [first, second] = screen.getAllByRole("button", { name: label });
	if (!first || !second) throw new Error("Two model slots expected");
	expect(first).toHaveTextContent("medium");
	fireEvent.keyDown(first, { key: "ArrowDown" });
	const menu = screen.getByRole("menu", { name: label });
	const option = (level: string) => within(menu).getByRole("menuitemcheckbox", { name: level });
	expect(
		within(menu)
			.getAllByRole("menuitemcheckbox")
			.map((item) => item.textContent),
	).toEqual(["off", "low", "medium", "high", "max"]);
	expect(option("off")).toHaveFocus();
	fireEvent.keyDown(option("off"), { key: "ArrowDown" });
	expect(option("low")).toHaveFocus();
	fireEvent.click(option("low"));
	fireEvent.click(option("max"));
	expect(option("low")).toHaveAttribute("aria-checked", "true");
	expect(option("max")).toHaveAttribute("aria-checked", "true");
	expect(first).toHaveAttribute("aria-expanded", "true");
	expect(second).not.toHaveTextContent("low");
	const metadata = () => JSON.parse(screen.getByLabelText("metadata").textContent ?? "{}");
	expect(metadata()).toEqual({
		m1: { name: "First", contextLength: 4096, efforts: ["low", "medium", "max"] },
		m2: { name: "Second", contextLength: 8000, maxOutput: 4000 },
	});
	for (const level of ["low", "medium", "max"]) fireEvent.click(option(level));
	expect(metadata().m1).toEqual({ name: "First", contextLength: 4096 });
	fireEvent.keyDown(option("low"), { key: "Escape" });
	expect(first).toHaveFocus();
	expect(screen.queryByRole("menu")).toBeNull();
	fireEvent.click(second);
	fireEvent.pointerDown(document.body);
	expect(screen.queryByRole("menu")).toBeNull();
});
