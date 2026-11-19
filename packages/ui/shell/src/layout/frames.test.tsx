// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ListFrame } from "./frames.tsx";
import { ShellProvider } from "./shell-context.tsx";

test("list titles and actions share the first row above full-size capsule tabs on every layout", () => {
	const list = (mode: "mobile" | "compact" | "medium" | "wide") => (
		<ShellProvider value={{ mode, left: <button type="button">Me</button>, meOpen: false }}>
			<ListFrame
				title="Tasks"
				action={<button type="button">Add</button>}
				center={<button type="button">Scheduled</button>}
			>
				List content
			</ListFrame>
		</ShellProvider>
	);
	const { container, rerender } = render(list("mobile"));
	for (const mode of ["mobile", "compact", "medium", "wide"] as const) {
		rerender(list(mode));
		const header = container.querySelector("header");
		expect(header).toContainElement(screen.getByRole("heading", { name: "Tasks" }));
		expect(header).toContainElement(screen.getByRole("button", { name: "Me" }));
		expect(header).toContainElement(screen.getByRole("button", { name: "Add" }));
		expect(header).not.toContainElement(screen.getByRole("button", { name: "Scheduled" }));
		expect(header?.nextElementSibling).toContainElement(screen.getByRole("button", { name: "Scheduled" }));
		expect(header?.nextElementSibling?.className).toContain("--control-lg");
	}
});

test("restores each tab's list position after a tab switch or pushed page", () => {
	const positions = { current: {} as Record<string, number> };
	const list = (key: string) => (
		<ShellProvider value={{ mode: "mobile", left: null, meOpen: false, scroll: { key, positions } }}>
			<ListFrame key={key}>
				<span>{key}</span>
			</ListFrame>
		</ShellProvider>
	);
	const { rerender } = render(list("messages"));
	const messages = screen.getByText("messages").parentElement as HTMLDivElement;
	messages.scrollTop = 145;
	fireEvent.scroll(messages);

	rerender(list("tasks"));
	const tasks = screen.getByText("tasks").parentElement as HTMLDivElement;
	expect(tasks.scrollTop).toBe(0);
	tasks.scrollTop = 70;
	fireEvent.scroll(tasks);

	rerender(list("messages"));
	expect(screen.getByText("messages").parentElement?.scrollTop).toBe(145);
	rerender(list("tasks"));
	expect(screen.getByText("tasks").parentElement?.scrollTop).toBe(70);
});
