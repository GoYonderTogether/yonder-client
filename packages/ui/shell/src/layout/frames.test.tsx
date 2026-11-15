// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ListFrame } from "./frames.tsx";
import { ShellProvider } from "./shell-context.tsx";

test("list sections sit below the mobile top bar and stay inside the desktop top bar", () => {
	const list = (mode: "mobile" | "compact" | "wide") => (
		<ShellProvider value={{ mode, left: <button type="button">Me</button>, meOpen: false }}>
			<ListFrame title="Tasks" center={<button type="button">Scheduled</button>}>
				List content
			</ListFrame>
		</ShellProvider>
	);
	const { container, rerender } = render(list("mobile"));
	const header = container.querySelector("header");
	expect(header).toContainElement(screen.getByRole("button", { name: "Me" }));
	expect(header).not.toContainElement(screen.getByRole("button", { name: "Scheduled" }));
	expect(header?.nextElementSibling).toContainElement(screen.getByRole("button", { name: "Scheduled" }));
	for (const mode of ["compact", "wide"] as const) {
		rerender(list(mode));
		expect(container.querySelector("header")).toContainElement(screen.getByRole("button", { name: "Scheduled" }));
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
