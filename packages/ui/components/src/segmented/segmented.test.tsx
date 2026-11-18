// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import { Segmented } from "./segmented.tsx";

function Example() {
	const [value, setValue] = useState("a");
	return (
		<Segmented
			aria-label="View"
			value={value}
			onChange={setValue}
			options={[
				{ value: "a", label: "A" },
				{ value: "b", label: "B", disabled: true },
				{ value: "c", label: "C" },
			]}
		/>
	);
}

test("arrow keys select and focus enabled segments, including wraparound", async () => {
	const user = userEvent.setup();
	render(<Example />);
	const first = screen.getByRole("radio", { name: "A" });
	const last = screen.getByRole("radio", { name: "C" });
	first.focus();
	await user.keyboard("{ArrowRight}");
	expect(last).toHaveFocus();
	expect(last).toBeChecked();
	await user.keyboard("{ArrowRight}");
	expect(first).toHaveFocus();
	expect(first).toBeChecked();
	await user.keyboard("{End}");
	expect(last).toHaveFocus();
	expect(last).toBeChecked();
});

test("the lg size is a full-width capsule with control-lg segments", () => {
	render(
		<Segmented
			aria-label="Tasks"
			size="lg"
			value="items"
			onChange={() => {}}
			options={[
				{ value: "items", label: "Items" },
				{ value: "goals", label: "Goals" },
			]}
		/>,
	);
	const group = screen.getByRole("radiogroup", { name: "Tasks" });
	expect(group.className).toContain("w-full");
	expect(group.className).toContain("--radius-full");
	expect(screen.getByRole("radio", { name: "Items" }).parentElement?.className).toContain("--control-lg");
});

test("the default size stays the 32px toolbar control", () => {
	render(<Segmented aria-label="View" value="a" onChange={() => {}} options={[{ value: "a", label: "A" }]} />);
	expect(screen.getByRole("radiogroup").className).toContain("--control-sm");
});
