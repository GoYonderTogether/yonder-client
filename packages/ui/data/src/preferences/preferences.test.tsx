// @vitest-environment jsdom
/**
 * The language and theme choices are one value shared by every screen: changing it in 「通用」 must
 * reach the provider that renders the whole app, and it is stored under the key the first-paint
 * script in index.html reads.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { createBrowserStorage } from "../storage/index.ts";

const raw = new Map<string, string>();
const storage = createBrowserStorage({
	getItem: (key: string) => raw.get(key) ?? null,
	setItem: (key: string, value: string) => void raw.set(key, value),
	removeItem: (key: string) => void raw.delete(key),
	key: (index: number) => [...raw.keys()][index] ?? null,
	get length() {
		return raw.size;
	},
	clear: () => raw.clear(),
} as unknown as globalThis.Storage);

vi.mock("../query/provider.tsx", () => ({
	useData: () => ({ storage }),
	useDataOrNull: () => ({ storage }),
	useApi: () => ({ updatePreferences: async () => Promise.reject(new Error("no account in this suite")) }),
	useApiOrNull: () => ({ updatePreferences: async () => Promise.reject(new Error("no account in this suite")) }),
}));
/** No account in this suite: the language follows the stored choice, as a signed-out screen does. */
vi.mock("../hooks/account.ts", () => ({ useMe: () => ({ data: undefined }) }));

const { readStyleChoice, readUISizeChoice, useLocalePreference, useTheme } = await import("./preferences.ts");

const wrapper = ({ children }: { children: ReactNode }) => (
	<QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("preferences", () => {
	test("style defaults safely and stays shared and persistent independently of light/dark", () => {
		expect(readStyleChoice({ get: () => null })).toBe("classic");
		expect(readStyleChoice({ get: () => "unknown" })).toBe("classic");
		const settings = renderHook(() => useTheme(), { wrapper });
		const app = renderHook(() => useTheme(), { wrapper });
		act(() => settings.result.current.setChoice("dark"));
		act(() => settings.result.current.setStyle("glow"));
		expect(app.result.current).toMatchObject({ style: "glow", choice: "dark", resolved: "dark" });
		expect(document.documentElement.dataset).toMatchObject({ style: "glow", theme: "dark" });
		expect(raw.get("yonder.style")).toBe("glow");
		settings.unmount();
		const reopened = renderHook(() => useTheme(), { wrapper });
		expect(reopened.result.current.style).toBe("glow");
		act(() => reopened.result.current.setStyle("classic"));
		expect(app.result.current.style).toBe("classic");
		expect(raw.get("yonder.theme")).toBe("dark");
	});

	test("interface size defaults to medium, is shared, and lands on the html element", () => {
		expect(readUISizeChoice({ get: () => null })).toBe("medium");
		expect(readUISizeChoice({ get: () => "huge" })).toBe("medium");
		const settings = renderHook(() => useTheme(), { wrapper });
		const app = renderHook(() => useTheme(), { wrapper });
		expect(app.result.current.size).toBe("medium");
		act(() => settings.result.current.setSize("xlarge"));
		expect(app.result.current.size).toBe("xlarge");
		expect(document.documentElement.dataset.uiSize).toBe("xlarge");
		expect(raw.get("yonder.ui-size")).toBe("xlarge");
		settings.unmount();
		expect(renderHook(() => useTheme(), { wrapper }).result.current.size).toBe("xlarge");
	});

	test("a language chosen while signed out is this device's own", () => {
		const settings = renderHook(() => useLocalePreference(), { wrapper });
		act(() => settings.result.current.setLocale("zh-CN"));
		// No account to hold the choice yet, so it is stored here — and read back at once.
		expect(raw.get("yonder.locale")).toBe("zh-CN");
		expect(raw.get("yonder.locale-mode")).toBe("manual");
		expect(settings.result.current.locale).toBe("zh-CN");
	});

	test("the stored keys are the ones the first-paint script reads", () => {
		const theme = renderHook(() => useTheme(), { wrapper });
		act(() => theme.result.current.setChoice("dark"));
		expect(raw.get("yonder.theme")).toBe("dark");
		expect([...raw.keys()].some((key) => key.startsWith("yonder.yonder."))).toBe(false);
	});
});
