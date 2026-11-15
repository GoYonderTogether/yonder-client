// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createRef, type Ref, useState } from "react";
import { expect, test } from "vitest";
import { Checkbox } from "./checkbox.tsx";

function Example({ checkboxRef }: { checkboxRef: Ref<HTMLInputElement> }) {
	const [checked, setChecked] = useState(false);
	return (
		<Checkbox ref={checkboxRef} checked={checked} onChange={(event) => setChecked(event.target.checked)}>
			Accept terms
		</Checkbox>
	);
}

test("checkbox toggles via its label and exposes the input ref", async () => {
	const user = userEvent.setup();
	const ref = createRef<HTMLInputElement>();
	render(<Example checkboxRef={ref} />);
	const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
	await user.click(screen.getByText("Accept terms"));
	expect(checkbox).toBeChecked();
	expect(ref.current).toBe(checkbox);
	ref.current?.focus();
	expect(checkbox).toHaveFocus();
	await user.keyboard(" ");
	expect(checkbox).not.toBeChecked();
});
