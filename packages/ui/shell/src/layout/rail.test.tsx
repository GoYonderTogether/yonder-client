// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
			titlebarInset
		/>,
	);
	const rail = screen.getByRole("navigation", { name: "Tabs" });
	const header = container.querySelector("header");
	expect(header).toHaveAttribute("data-tauri-drag-region");
	expect(header?.firstElementChild).toHaveClass("h-[var(--titlebar-height)]");
	expect(header).not.toContainElement(screen.getByRole("button", { name: "Me" }));
	expect(rail.children[1]).toContainElement(screen.getByRole("button", { name: "Me" }));
});
