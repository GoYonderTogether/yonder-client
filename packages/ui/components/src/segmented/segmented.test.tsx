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
