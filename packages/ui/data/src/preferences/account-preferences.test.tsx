// @vitest-environment jsdom
/**
 * The account's zone and language: two modes (`auto` follows this device, `manual` locks a value)
 * and one adapter the settings page saves through. Stage 1 writes local storage; the tests pin that
 * a save either lands or reports why, and never pretends a server answered.
 */
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
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

/** The device this suite pretends to run on. */
let deviceZone = "Asia/Singapore";
vi.mock("../query/provider.tsx", () => ({ useDataOrNull: () => ({ storage }) }));
vi.mock("@yonder/ui-time", async (original) => {
	const actual = await original<typeof import("@yonder/ui-time")>();
	return { ...actual, deviceTimeZone: () => deviceZone };
});

const {
	effectiveLocale,
	effectiveTimeZone,
	readLocalePreference,
	readTimeZonePreference,
	useAccountPreferences,
	useAccountTimeZone,
	useSavePreferences,
} = await import("./account-preferences.ts");

const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

beforeEach(() => {
	raw.clear();
	deviceZone = "Asia/Singapore";
});

describe("reading the stored choice", () => {
	test("an account with nothing stored follows this device", () => {
		expect(readTimeZonePreference({ get: () => null })).toEqual({ mode: "auto", zone: null });
		expect(readLocalePreference({ get: () => null })).toEqual({ mode: "auto", locale: null });
	});

	test("a locked zone reads back; an unknown zone name is refused rather than kept", () => {
		raw.set("yonder.timezone-mode", "manual");
		raw.set("yonder.timezone", "Asia/Shanghai");
		expect(readTimeZonePreference(storage)).toEqual({ mode: "manual", zone: "Asia/Shanghai" });
		raw.set("yonder.timezone", "Not/AZone");
		expect(readTimeZonePreference(storage)).toEqual({ mode: "auto", zone: null });
	});

	test("a language stored before there was a mode counts as the account's own choice", () => {
		raw.set("yonder.locale", "zh-CN");
		expect(readLocalePreference(storage)).toEqual({ mode: "manual", locale: "zh-CN" });
		raw.set("yonder.locale-mode", "auto");
		expect(readLocalePreference(storage)).toEqual({ mode: "auto", locale: null });
	});

	test("the effective zone and language are the locked ones, else the device's", () => {
		expect(effectiveTimeZone({ mode: "auto", zone: null }, "America/New_York")).toBe("America/New_York");
		expect(effectiveTimeZone({ mode: "manual", zone: "Asia/Shanghai" }, "America/New_York")).toBe("Asia/Shanghai");
		expect(effectiveLocale({ mode: "auto", locale: null }, "en")).toBe("en");
		expect(effectiveLocale({ mode: "manual", locale: "zh-CN" }, "en")).toBe("zh-CN");
	});
});

describe("the hook every screen reads", () => {
	test("in auto the zone is this device's; a lock overrides it and says what the device is", () => {
		const hook = renderHook(() => useAccountPreferences(), { wrapper });
		expect(hook.result.current.zone).toBe("Asia/Singapore");
		expect(hook.result.current.timezone.mode).toBe("auto");

		// The save hook is what writes and notifies; a direct storage write alone would not.
		const saver = renderHook(() => useSavePreferences(), { wrapper });
		act(() => {
			void saver.result.current.save({ timezone: { mode: "manual", zone: "Asia/Shanghai" } });
		});
		expect(hook.result.current.zone).toBe("Asia/Shanghai");
		const zone = renderHook(() => useAccountTimeZone(), { wrapper });
		expect(zone.result.current).toBe("Asia/Shanghai");
		const preferences = renderHook(() => useAccountPreferences(), { wrapper }).result.current;
		expect(preferences.deviceZone).toBe("Asia/Singapore");
	});

	test("every reader sees a change made by the save hook", () => {
		const reader = renderHook(() => useAccountPreferences(), { wrapper });
		const saver = renderHook(() => useSavePreferences(), { wrapper });
		act(() => {
			void saver.result.current.save({ locale: { mode: "manual", locale: "en" } });
		});
		expect(reader.result.current.localeValue).toBe("en");
		expect(reader.result.current.locale).toEqual({ mode: "manual", locale: "en" });
	});
});

describe("the save adapter", () => {
	test("a save writes local storage, and switching back to auto clears the lock", async () => {
		const saver = renderHook(() => useSavePreferences(), { wrapper });
		await act(async () => {
			expect(await saver.result.current.save({ timezone: { mode: "manual", zone: "Asia/Shanghai" } })).toBe(true);
		});
		expect(raw.get("yonder.timezone")).toBe("Asia/Shanghai");
		expect(raw.get("yonder.timezone-mode")).toBe("manual");
		await act(async () => {
			expect(await saver.result.current.save({ timezone: { mode: "auto", zone: null } })).toBe(true);
		});
		expect(raw.has("yonder.timezone")).toBe(false);
		expect(raw.get("yonder.timezone-mode")).toBe("auto");
	});

	test("a save that cannot land reports the real reason instead of pretending", async () => {
		const saver = renderHook(() => useSavePreferences(), { wrapper });
		let saved = true;
		await act(async () => {
			saved = await saver.result.current.save({ timezone: { mode: "manual", zone: "Not/AZone" } });
		});
		expect(saved).toBe(false);
		expect(saver.result.current.error).toBeInstanceOf(Error);
		expect((saver.result.current.error as Error).message).toBe("unknown-time-zone");
		expect(raw.has("yonder.timezone")).toBe(false);
		act(() => saver.result.current.reset());
		expect(saver.result.current.error).toBeNull();
	});

	test("a language lock is written beside its mode, so the first paint can honour it", async () => {
		const saver = renderHook(() => useSavePreferences(), { wrapper });
		await act(async () => {
			expect(await saver.result.current.save({ locale: { mode: "manual", locale: "en" } })).toBe(true);
		});
		expect(raw.get("yonder.locale")).toBe("en");
		expect(raw.get("yonder.locale-mode")).toBe("manual");
	});
});
