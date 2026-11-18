// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { CompletionHighlight } from "./highlight.tsx";
import { completionToken } from "./tokens.ts";

test("confirmed markers and the active token are highlighted without changing the draft text", () => {
	const text = "/same /same @Alex Doe @chatbot user@example.com <b>text</b>";
	const bindings = [
		{ id: "skill", key: "skill", kind: "skill", marker: "/same", start: 0, end: 5 },
		{ id: "member", key: "member", kind: "member", marker: "@Alex Doe", start: 12, end: 21 },
		{ id: "stale", key: "stale", kind: "member", marker: "@example", start: 35, end: 43 },
	] as const;
	const view = render(
		<CompletionHighlight text={text} bindings={bindings} token={completionToken(text, text.indexOf("bot"))} />,
	);
	const marks = () => [...view.container.querySelectorAll(".composer-completion-mark")].map((node) => node.textContent);
	expect(marks()).toEqual(["/same", "@Alex Doe", "@chatbot"]);
	expect(view.container.querySelector("b")).toBeNull();
	expect(view.container.textContent).toBe(`${text}\n`);
	view.rerender(
		<CompletionHighlight text={text} bindings={bindings} token={completionToken(text, text.indexOf(" Doe"))} />,
	);
	expect(marks()).toEqual(["/same", "@Alex Doe"]);
	expect(view.container.textContent).toBe(`${text}\n`);
});
