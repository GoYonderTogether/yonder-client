// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ListGroup, ListRow, Switch } from "@yonder/ui-components";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

function SwitchRow() {
	const [on, setOn] = useState(false);
	return (
		<ListGroup>
			<ListRow
				title="Public profile"
				control={<Switch checked={on} onChange={(event) => setOn(event.target.checked)} />}
			/>
		</ListGroup>
	);
}

describe("ListRow", () => {
	test("a default row is a button and draws a lucide chevron when it opens a screen", async () => {
		const onClick = vi.fn();
		const { container } = render(
			<ListGroup>
				<ListRow title="Account" chevron onClick={onClick} />
			</ListGroup>,
		);
		await userEvent.click(screen.getByRole("button", { name: "Account" }));
		expect(onClick).toHaveBeenCalledOnce();
		expect(container.querySelector("svg.lucide-chevron-right")).toHaveAttribute("aria-hidden", "true");
	});

	test("a static row shows information without being a button", () => {
		render(
			<ListGroup>
				<ListRow static title="Version" value="0.3.0" />
			</ListGroup>,
		);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(screen.getByText("Version")).toBeInTheDocument();
		expect(screen.getByText("0.3.0")).toBeInTheDocument();
	});

	test("a control row is the switch's label, so clicking the title toggles it", async () => {
		render(<SwitchRow />);
		const control = screen.getByRole("switch", { name: "Public profile" });
		expect(control).not.toBeChecked();
		await userEvent.click(screen.getByText("Public profile"));
		expect(control).toBeChecked();
		expect(control).toHaveAttribute("aria-checked", "true");
	});

	test("every row keeps the inset hairline, hidden on the last one", () => {
		const { container } = render(
			<ListGroup>
				<ListRow title="One" />
				<ListRow static title="Two" />
			</ListGroup>,
		);
		const lines = container.querySelectorAll("li > span:last-child");
		expect(lines).toHaveLength(2);
		for (const line of lines) {
			expect(line.className).toContain("start-[var(--spacing-4)]");
			expect(line.className).toContain("group-last/row:hidden");
		}
	});
});

describe("Switch", () => {
	test("is a real checkbox with the switch role, named by aria-label", async () => {
		const onChange = vi.fn();
		render(<Switch aria-label="Notifications" onChange={onChange} />);
		const control = screen.getByRole("switch", { name: "Notifications" });
		await userEvent.click(control);
		expect(onChange).toHaveBeenCalledOnce();
	});

	test("busy blocks input and says so", () => {
		render(<Switch aria-label="Sync" busy checked onChange={() => {}} />);
		const control = screen.getByRole("switch", { name: "Sync" });
		expect(control).toBeDisabled();
		expect(control).toHaveAttribute("aria-busy", "true");
	});
});
