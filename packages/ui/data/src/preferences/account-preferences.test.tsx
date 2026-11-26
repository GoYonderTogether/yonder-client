// @vitest-environment jsdom
/**
 * The account's zone and language come from `me` (the server's resolved preference) and are saved
 * through the real endpoint; this suite pins that shape: the resolved value wins, a manual pick is
 * not overridden by the device, the save writes the server's answer into the cache, an invalid zone
 * shows the server's own reason, and a device report is sent only while the account follows it.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { LocaleSetting, MeResponse, TimezonePreference } from "@yonder/protocol";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createMemoryStorage } from "../storage/index.ts";

const api = vi.hoisted(() => ({
	updatePreferences: vi.fn(),
	reportDeviceTimezone: vi.fn(),
	reportDeviceLocale: vi.fn(),
	me: vi.fn(),
}));

const storage = createMemoryStorage();

let me: MeResponse | null = null;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
vi.mock("../query/provider.tsx", () => ({
	useApi: () => api,
	useApiOrNull: () => api,
	useData: () => ({ storage, queryClientForPreferences: queryClient }),
	useDataOrNull: () => ({ storage, queryClientForPreferences: queryClient }),
}));

/** The device this suite pretends to run on. */
let deviceZone = "Asia/Singapore";
vi.mock("@yonder/ui-time", async (original) => {
	const actual = await original<typeof import("@yonder/ui-time")>();
	return { ...actual, deviceTimeZone: () => deviceZone };
});

const {
	effectiveLocale,
	effectiveTimeZone,
	syncAccountPreferences,
	useAccountPreferences,
	useAccountTimeZone,
	useDevicePreferenceReport,
	useSavePreferences,
} = await import("./account-preferences.ts");

function wrapper({ children }: { children: ReactNode }) {
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function fixture(overrides: { timezone?: Partial<TimezonePreference>; locale?: Partial<LocaleSetting> } = {}) {
	const base: MeResponse = {
		member: {
			id: "member-a",
			kind: "person",
			handle: "someone",
			displayName: "Someone",
			avatarUrl: null,
			bio: null,
			ownerId: null,
			isDefault: false,
			createdAt: "2026-11-15T00:00:00Z",
			version: 1,
		},
		bot: {
			id: "bot-a",
			kind: "bot",
			handle: "someone-bot",
			displayName: "Bot",
			avatarUrl: null,
			bio: null,
			ownerId: "member-a",
			isDefault: true,
			createdAt: "2026-11-15T00:00:00Z",
			version: 1,
		},
		signInMethods: [],
		hasPassword: true,
		handleChange: { canChange: true, nextChangeAt: null },
		settings: { locale: "en", theme: "system" },
		timezone: { mode: "auto", zone: "Asia/Singapore", manual: null, device: "Asia/Singapore", ...overrides.timezone },
		locale: { mode: "auto", value: "en", manual: null, device: "en", ...overrides.locale },
	};
	return base;
}

beforeEach(() => {
	storage.clear();
	queryClient.clear();
	me = fixture();
	syncAccountPreferences(me);
	api.me.mockResolvedValue(me);
	api.updatePreferences.mockReset();
	api.reportDeviceTimezone.mockReset();
	api.reportDeviceLocale.mockReset();
	deviceZone = "Asia/Singapore";
});

describe("the resolved values", () => {
	test("an auto account reads the server's resolved zone and language", () => {
		const { result } = renderHook(() => useAccountPreferences(), { wrapper });
		expect(result.current.zone).toBe("Asia/Singapore");
		expect(result.current.localeValue).toBe("en");
		expect(result.current.timezone.mode).toBe("auto");
	});

	test("a manual lock governs on every device, whatever this device reports", () => {
		me = fixture({
			timezone: { mode: "manual", zone: "Asia/Shanghai", manual: "Asia/Shanghai", device: "America/New_York" },
			locale: { mode: "manual", value: "zh-CN", manual: "zh-CN", device: "en" },
		});
		syncAccountPreferences(me);
		const { result } = renderHook(() => useAccountPreferences(), { wrapper });
		expect(result.current.zone).toBe("Asia/Shanghai");
		expect(result.current.localeValue).toBe("zh-CN");
		// The hint still knows what this device — and the account's last device — is set to.
		expect(result.current.deviceLocale).toBe(deviceLocaleFromBrowser());
		expect(result.current.timezone.device).toBe("America/New_York");
	});

	test("before `me` answers, the device's own zone and language stand in", () => {
		syncAccountPreferences(null);
		const { result } = renderHook(() => useAccountTimeZone(), { wrapper });
		expect(result.current).toBe("Asia/Singapore");
		const preferences = renderHook(() => useAccountPreferences(), { wrapper }).result.current;
		expect(preferences.fromAccount).toBe(false);
	});

	test("a server from before the preference fields keeps the language that account had chosen", () => {
		// A pre-migration `me`: `settings.locale` is the old place, and there is no `timezone`.
		syncAccountPreferences({ settings: { locale: "zh-CN" } } as never);
		const { result } = renderHook(() => useAccountPreferences(), { wrapper });
		expect(result.current.localeValue).toBe("zh-CN");
		expect(result.current.zone).toBe("Asia/Singapore");
		expect(result.current.fromAccount).toBe(true);
	});

	test("an unknown effective zone still reads as the device's, the one honest fallback", () => {
		expect(effectiveTimeZone({ mode: "auto", zone: "", manual: null, device: null }, "Asia/Singapore")).toBe(
			"Asia/Singapore",
		);
		expect(effectiveTimeZone({ mode: "manual", zone: "Asia/Shanghai", manual: "Asia/Shanghai", device: null })).toBe(
			"Asia/Shanghai",
		);
		// A copy with an empty value (an old server one deep into a rollout) still falls back.
		expect(effectiveLocale({ mode: "auto", value: "" as never, manual: null, device: null }, "en")).toBe("en");
	});
});

describe("the save adapter", () => {
	test("a save goes to the endpoint and the server's answer becomes what every screen reads", async () => {
		const saver = renderHook(() => useSavePreferences(), { wrapper });
		api.updatePreferences.mockResolvedValue(
			fixture({ timezone: { mode: "manual", zone: "America/New_York", manual: "America/New_York" } }),
		);
		let saved = false;
		await act(async () => {
			saved = await saver.result.current.save({ timezone: { mode: "manual", zone: "America/New_York" } });
		});
		expect(saved).toBe(true);
		expect(api.updatePreferences).toHaveBeenCalledWith({ timezone: { mode: "manual", zone: "America/New_York" } });
		const reader = renderHook(() => useAccountTimeZone(), { wrapper });
		await waitFor(() => expect(reader.result.current).toBe("America/New_York"));
	});

	test("a language save keeps a mirror, so the sign-in screen and the first paint agree", async () => {
		const saver = renderHook(() => useSavePreferences(), { wrapper });
		api.updatePreferences.mockResolvedValue(fixture({ locale: { mode: "manual", value: "zh-CN", manual: "zh-CN" } }));
		await act(async () => {
			await saver.result.current.save({ locale: { mode: "manual", value: "zh-CN" } });
		});
		expect(storage.get("locale")).toBe("zh-CN");
		expect(storage.get("locale-mode")).toBe("manual");
	});

	test("an invalid zone shows the server's own reason and keeps the old choice", async () => {
		const { ApiError } = await import("@yonder/api-client");
		const saver = renderHook(() => useSavePreferences(), { wrapper });
		api.updatePreferences.mockRejectedValue(
			new ApiError({ code: "invalid_timezone", status: 400, message: "unknown zone", details: { field: "timezone" } }),
		);
		let saved = true;
		await act(async () => {
			saved = await saver.result.current.save({ timezone: { mode: "manual", zone: "Not/AZone" } });
		});
		expect(saved).toBe(false);
		expect(saver.result.current.error).toBeInstanceOf(ApiError);
		expect((saver.result.current.error as InstanceType<typeof ApiError>).code).toBe("invalid_timezone");
		expect(renderHook(() => useAccountTimeZone(), { wrapper }).result.current).toBe("Asia/Singapore");
	});
});

describe("the device report", () => {
	test("an auto account reports its own device zone and language", async () => {
		api.reportDeviceTimezone.mockResolvedValue({ ok: true });
		api.reportDeviceLocale.mockResolvedValue({ ok: true });
		deviceZone = "Europe/Paris";
		syncAccountPreferences(fixture({ timezone: { device: "Asia/Singapore" }, locale: { device: "zh-CN" } }));
		renderHook(() => useDevicePreferenceReport(), { wrapper });
		await waitFor(() => expect(api.reportDeviceTimezone).toHaveBeenCalledWith("Europe/Paris"));
		await waitFor(() => expect(api.reportDeviceLocale).toHaveBeenCalled());
	});

	test("a manual account reports nothing", async () => {
		syncAccountPreferences(
			fixture({
				timezone: { mode: "manual", manual: "Asia/Shanghai", device: "Asia/Singapore" },
				locale: { mode: "manual", manual: "zh-CN", device: "en" },
			}),
		);
		deviceZone = "America/New_York";
		renderHook(() => useDevicePreferenceReport(), { wrapper });
		await act(async () => undefined);
		expect(api.reportDeviceTimezone).not.toHaveBeenCalled();
		expect(api.reportDeviceLocale).not.toHaveBeenCalled();
	});
});

function deviceLocaleFromBrowser() {
	return /^zh\b|^zh-/iu.test(globalThis.navigator?.language ?? "en") ? "zh-CN" : "en";
}
