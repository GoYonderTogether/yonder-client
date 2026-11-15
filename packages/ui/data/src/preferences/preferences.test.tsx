// @vitest-environment jsdom
/**
 * The language and theme choices are one value shared by every screen: changing it in 「通用」 must
 * reach the provider that renders the whole app, and it is stored under the key the first-paint
 * script in index.html reads.
 */
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

vi.mock("../query/provider.tsx", () => ({ useData: () => ({ storage }) }));

const { readStyleChoice, useLocalePreference, useTheme } = await import("./preferences.ts");

const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

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

	test("a language chosen in one place is seen everywhere", () => {
		const settings = renderHook(() => useLocalePreference(), { wrapper });
		const app = renderHook(() => useLocalePreference(), { wrapper });
		act(() => settings.result.current.setLocale("zh-CN"));
		expect(app.result.current.locale).toBe("zh-CN");
		act(() => settings.result.current.setLocale("en"));
		expect(app.result.current.locale).toBe("en");
	});

	test("the stored keys are the ones the first-paint script reads", () => {
		const theme = renderHook(() => useTheme(), { wrapper });
		const locale = renderHook(() => useLocalePreference(), { wrapper });
		act(() => theme.result.current.setChoice("dark"));
		act(() => locale.result.current.setLocale("zh-CN"));
		expect(raw.get("yonder.theme")).toBe("dark");
		expect(raw.get("yonder.locale")).toBe("zh-CN");
		expect([...raw.keys()].some((key) => key.startsWith("yonder.yonder."))).toBe(false);
	});
});
