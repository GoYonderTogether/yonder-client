// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { IconButton, Listbox, MENU_SURFACE, Menu } from "@yonder/ui-components";
import { describe, expect, test, vi } from "vitest";

function Example({ onSelect = vi.fn() }: { onSelect?: (id: string) => void }) {
	return (
		<Menu
			label="Actions"
			onSelect={onSelect}
			items={[
				{ id: "bot", label: "New Bot" },
				{ id: "off", label: "Disabled", disabled: true },
				{ id: "delete", label: "Delete", tone: "danger" },
			]}
			trigger={(props) => (
				<IconButton {...props} aria-label="More">
					+
				</IconButton>
			)}
		/>
	);
}

describe("Menu", () => {
	test("opens from its trigger, focuses the first item, and skips disabled items", async () => {
		const user = userEvent.setup();
		render(<Example />);
		const trigger = screen.getByRole("button", { name: "More" });
		expect(trigger).toHaveAttribute("aria-haspopup", "menu");
		await user.click(trigger);
		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByRole("menu", { name: "Actions" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "New Bot" })).toHaveFocus();
		await user.keyboard("{ArrowDown}");
		expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
		await user.keyboard("{ArrowDown}");
		expect(screen.getByRole("menuitem", { name: "New Bot" })).toHaveFocus();
	});

	test("selecting closes the menu, returns focus, and reports the id", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(<Example onSelect={onSelect} />);
		await user.click(screen.getByRole("button", { name: "More" }));
		await user.click(screen.getByRole("menuitem", { name: "Delete" }));
		expect(onSelect).toHaveBeenCalledWith("delete");
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "More" })).toHaveFocus();
	});

	test("Escape closes without selecting", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(<Example onSelect={onSelect} />);
		await user.click(screen.getByRole("button", { name: "More" }));
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("the menu and the listbox share one surface", async () => {
		const user = userEvent.setup();
		render(
			<>
				<Example />
				<Listbox label="Region" value="cn" onChange={() => {}} options={[{ value: "cn", label: "+86" }]} />
			</>,
		);
		await user.click(screen.getByRole("button", { name: "More" }));
		expect(screen.getByRole("menu").className).toContain(MENU_SURFACE);
		await user.click(screen.getByRole("button", { name: "Region: +86" }));
		expect(screen.getByRole("listbox").parentElement?.className).toContain(MENU_SURFACE);
	});
});
