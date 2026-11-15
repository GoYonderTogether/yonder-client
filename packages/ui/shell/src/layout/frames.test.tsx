// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ListFrame } from "./frames.tsx";
import { ShellProvider } from "./shell-context.tsx";

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
