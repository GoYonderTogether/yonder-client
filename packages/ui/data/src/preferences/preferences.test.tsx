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

const { useLocalePreference, useTheme } = await import("./preferences.ts");

const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

describe("preferences", () => {
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
