// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Badge, Banner, Button, EmptyState, InlineError, LoadingRow, Spinner } from "@yonder/ui-components";
import { describe, expect, test, vi } from "vitest";

describe("Banner", () => {
	test("info and warning are a status, danger is an alert", () => {
		const { rerender } = render(<Banner>Quota used up</Banner>);
		expect(screen.getByRole("status")).toHaveTextContent("Quota used up");
		rerender(<Banner tone="warning">Almost out</Banner>);
		expect(screen.getByRole("status")).toHaveAttribute("data-tone", "warning");
		rerender(<Banner tone="danger">Offline</Banner>);
		expect(screen.getByRole("alert")).toHaveTextContent("Offline");
	});

	test("puts the action after the text and keeps the icon decorative", () => {
		render(
			<Banner icon={<svg data-testid="icon" />} action={<Button variant="link">Invite</Button>}>
				Used up
			</Banner>,
		);
		const banner = screen.getByRole("status");
		expect(banner.lastElementChild).toContainElement(screen.getByRole("button", { name: "Invite" }));
		expect(screen.getByTestId("icon").parentElement).toHaveAttribute("aria-hidden", "true");
	});
});

describe("InlineError", () => {
	test("announces the real reason once and offers a retry", async () => {
		const retry = vi.fn();
		render(
			<InlineError onRetry={retry} retryLabel="Try again">
				Network unreachable
			</InlineError>,
		);
		expect(screen.getByRole("alert")).toHaveTextContent("Network unreachable");
		await userEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(retry).toHaveBeenCalledOnce();
	});

	test("has no retry button without both a handler and a label", () => {
		render(<InlineError>Failed</InlineError>);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	test("can stand in for the rows of a list", () => {
		render(
			<ul>
				<InlineError as="li">Failed</InlineError>
			</ul>,
		);
		expect(screen.getByRole("alert").tagName).toBe("LI");
	});
});

describe("Spinner and LoadingRow", () => {
	test("a bare spinner is decorative; a labelled one is a status", () => {
		const { container, rerender } = render(<Spinner />);
		expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
		rerender(<Spinner label="Loading" />);
		expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
	});

	test("sizes follow the icon tokens", () => {
		const { container } = render(<Spinner size="lg" />);
		expect(container.firstElementChild?.className).toContain("--icon-lg");
		expect(container.firstElementChild?.className).toContain("animate-spinner");
	});

	test("a loading row is one status line with a spinner", () => {
		render(<LoadingRow label="Loading…" />);
		const row = screen.getByRole("status");
		expect(row).toHaveTextContent("Loading…");
		expect(row.querySelector("[aria-hidden='true']")).toBeInTheDocument();
	});

	test("a loading button uses the same spinner and keeps its label", () => {
		const { container } = render(<Button loading>Save</Button>);
		expect(container.querySelector(".animate-spinner, [class*='animate-spinner']")).toBeInTheDocument();
		expect(screen.getByRole("button")).toHaveTextContent("Save");
	});
});

describe("Badge", () => {
	test("defaults to neutral and accepts accent and danger", () => {
		const { rerender } = render(<Badge>Owner</Badge>);
		expect(screen.getByText("Owner").className).toContain("--color-bg-subtle");
		rerender(<Badge tone="danger">3</Badge>);
		expect(screen.getByText("3").className).toContain("--color-danger");
		rerender(<Badge tone="accent">This device</Badge>);
		expect(screen.getByText("This device").className).toContain("--color-accent-subtle");
	});
});

describe("EmptyState inline", () => {
	test("is one line inside a list, with no heading", () => {
		render(
			<ul>
				<EmptyState variant="inline" as="li" title="No devices" action={<Button size="sm">Add</Button>} />
			</ul>,
		);
		expect(screen.queryByRole("heading")).not.toBeInTheDocument();
		expect(screen.getByText("No devices").closest("li")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
	});

	test("the page variant keeps its heading", () => {
		render(<EmptyState title="Nothing yet" />);
		expect(screen.getByRole("heading", { name: "Nothing yet" })).toBeInTheDocument();
	});
});
