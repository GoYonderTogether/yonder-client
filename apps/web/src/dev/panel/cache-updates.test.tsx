// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryStorage, DataProvider, useDataQueryClient } from "@yonder/ui-data";
import { afterEach, expect, test, vi } from "vitest";
import { DiagnosticsSections } from "./diagnostics.tsx";

afterEach(() => vi.unstubAllGlobals());

function CacheWriter({ write }: { write: boolean }) {
	const queryClient = useDataQueryClient();
	if (write && !queryClient.getQueryData(["rendered-query"])) queryClient.setQueryData(["rendered-query"], true);
	return null;
}

test("cache updates during another component's render are deferred and reflected in the panel", async () => {
	vi.stubGlobal("fetch", async () => ({
		ok: true,
		status: 200,
		json: async () => ({ ok: true, version: "test", time: "", sms: "" }),
	}));
	const storage = createMemoryStorage();
	const originalError = console.error;
	const consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => originalError(...args));
	const tree = (write: boolean) => (
		<DataProvider baseUrl="" appVersion="test" clientKind="shell" storage={storage}>
			<DiagnosticsSections />
			<CacheWriter write={write} />
		</DataProvider>
	);
	const view = render(tree(false));
	view.rerender(tree(true));
	await waitFor(() => expect(screen.queryByText('["rendered-query"]')).not.toBeNull());
	expect(consoleError.mock.calls.filter(([message]) => String(message).includes("Cannot update a component"))).toEqual(
		[],
	);
	consoleError.mockRestore();
});
