// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { SkillHighlight } from "./highlight.tsx";

test("only confirmed skill ranges are highlighted and raw markup remains plain text", () => {
	const view = render(
		<SkillHighlight
			text="/same /same @Person <b>text</b>"
			bindings={[
				{ id: "skill", key: "skill", kind: "skill", marker: "/same", start: 0, end: 5 },
				{ id: "member", key: "member", kind: "member", marker: "@Person", start: 12, end: 19 },
			]}
		/>,
	);
	expect(view.container.querySelectorAll(".composer-skill-mark")).toHaveLength(1);
	expect(view.container.querySelector(".composer-skill-mark")).toHaveTextContent("/same");
	expect(view.container.querySelector("b")).toBeNull();
	expect(view.container).toHaveTextContent("/same /same @Person <b>text</b>");
});
