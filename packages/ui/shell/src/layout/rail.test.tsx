// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Rail } from "./rail.tsx";

test("the macOS inset reserves a draggable 52px row above the avatar", () => {
	const { container } = render(
		<Rail
			current="messages"
			onSelect={vi.fn()}
			labels={{ messages: "Messages", tasks: "Tasks", memory: "Memory" }}
			ariaLabel="Tabs"
			renderAvatar={() => <span>avatar</span>}
			onOpenMe={vi.fn()}
			meOpen={false}
			meLabel="Me"
			settingsLabel="Settings"
			updateAction={<button type="button">Update ready</button>}
			titlebarInset
		/>,
	);
	expect(screen.getByRole("button", { name: "Update ready" }).nextElementSibling).toBe(
		screen.getByRole("button", { name: "Settings" }),
	);
	const rail = screen.getByRole("navigation", { name: "Tabs" });
	const header = container.querySelector("header");
	expect(header).toHaveAttribute("data-tauri-drag-region");
	expect(header?.firstElementChild).toHaveClass("h-[var(--titlebar-height)]");
	expect(header).not.toContainElement(screen.getByRole("button", { name: "Me" }));
	expect(rail.children[1]).toContainElement(screen.getByRole("button", { name: "Me" }));
});

test("desktop contacts entry opens independently of the three main tabs", () => {
	const open = vi.fn();
	render(
		<Rail
			current="messages"
			onSelect={vi.fn()}
			labels={{ messages: "Messages", tasks: "Tasks", memory: "Memory" }}
			ariaLabel="Tabs"
			renderAvatar={() => null}
			onOpenMe={vi.fn()}
			meOpen={false}
			meLabel="Me"
			settingsLabel="Settings"
			titlebarInset={false}
			onOpenContacts={open}
			contactsLabel="Contacts"
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Contacts" }));
	expect(open).toHaveBeenCalledOnce();
});
