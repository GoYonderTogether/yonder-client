// @vitest-environment jsdom
/**
 * 「通用」's zone and language rows: follow this device or lock one, the picker's order and search,
 * and what a failed save says. The save adapter is mocked with its real shape, including the failure
 * path, so the assertion is what the page shows — not that a request was made.
 */
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createI18n, type Locale } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, test, vi } from "vitest";

type Mode = "auto" | "manual";
let state = {
	zone: "Asia/Singapore",
	deviceZone: "Asia/Singapore",
	timezoneMode: "auto" as Mode,
	lockedZone: null as string | null,
	locale: "zh-CN" as Locale,
	deviceLocale: "zh-CN" as Locale,
	localeMode: "auto" as Mode,
};
let saveError: unknown = null;
const saves: { timezone?: { mode: Mode; zone: string | null }; locale?: { mode: Mode; locale: Locale | null } }[] = [];

vi.mock("@yonder/ui-data", () => ({
	ApiError: class ApiError extends Error {
		code = "invalid_request";
		messageKey = "errors.invalid_request";
	},
	NetworkError: class NetworkError extends Error {},
	useAccountPreferences: () => ({
		timezone: {
			mode: state.timezoneMode,
			zone: state.lockedZone ?? state.deviceZone,
			manual: state.lockedZone,
			device: state.deviceZone,
		},
		locale: {
			mode: state.localeMode,
			value: state.locale,
			manual: state.localeMode === "manual" ? state.locale : null,
			device: state.deviceLocale,
		},
		zone: state.zone,
		localeValue: state.locale,
		deviceZone: state.deviceZone,
		deviceLocale: state.deviceLocale,
	}),
	useSavePreferences: () => ({
		save: async (patch: (typeof saves)[number]) => {
			saves.push(patch);
			if (saveError) return false;
			if (patch.timezone) {
				state.timezoneMode = patch.timezone.mode;
				state.lockedZone = patch.timezone.zone;
				state.zone = patch.timezone.zone ?? state.deviceZone;
			}
			if (patch.locale) {
				state.localeMode = patch.locale.mode;
				state.locale = patch.locale.locale ?? state.deviceLocale;
			}
			return true;
		},
		pending: false,
		error: saveError,
		reset: () => {
			saveError = null;
		},
	}),
}));

const { LanguageSection, TimeZoneDeviceNote, TimeZonePicker, TimeZoneSection } = await import(
	"./account-preferences-sections.tsx"
);

function show(node: React.ReactNode, locale: Locale = "zh-CN") {
	return render(<I18nextProvider i18n={createI18n(locale)}>{node}</I18nextProvider>);
}

beforeEach(() => {
	saves.length = 0;
	saveError = null;
	state = {
		zone: "Asia/Singapore",
		deviceZone: "Asia/Singapore",
		timezoneMode: "auto",
		lockedZone: null,
		locale: "zh-CN",
		deviceLocale: "zh-CN",
		localeMode: "auto",
	};
});

describe("the zone row", () => {
	test("follow this device says which zone that is, and choosing it saves auto", async () => {
		state.timezoneMode = "manual";
		state.lockedZone = "Asia/Shanghai";
		state.zone = "Asia/Shanghai";
		show(<TimeZoneSection onOpenPicker={() => undefined} />);
		expect(screen.getByRole("radio", { name: /跟随系统/ })).not.toBeChecked();
		expect(screen.getByText(/新加坡/)).toBeInTheDocument();
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: /跟随系统/ }));
		});
		expect(saves.at(-1)).toEqual({ timezone: { mode: "auto" } });
	});

	test("a locked zone says what it is, and a differing device gets one quiet line", () => {
		state.timezoneMode = "manual";
		state.lockedZone = "Asia/Shanghai";
		state.deviceZone = "Asia/Singapore";
		show(
			<>
				<TimeZoneSection onOpenPicker={() => undefined} />
				<TimeZoneDeviceNote />
			</>,
		);
		expect(screen.getByText(/已锁定：北京时间 UTC\+8/)).toBeInTheDocument();
		expect(screen.getByText(/此设备是 新加坡 UTC\+8/)).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /切换|换回/ })).toBeNull();
	});

	test("when the device already matches the lock, the second line is not shown", () => {
		state.timezoneMode = "manual";
		state.lockedZone = "Asia/Singapore";
		show(<TimeZoneDeviceNote />);
		expect(screen.queryByText(/此设备是/)).toBeNull();
	});

	test("the manual row opens the picker", async () => {
		const open = vi.fn();
		show(<TimeZoneSection onOpenPicker={open} />);
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: /手动选择/ }));
		});
		expect(open).toHaveBeenCalledTimes(1);
		expect(saves).toHaveLength(0);
	});

	test("a failed save shows the real reason and leaves the choice unchanged", async () => {
		saveError = new Error("storage");
		state.timezoneMode = "manual";
		state.lockedZone = "Asia/Shanghai";
		show(<TimeZoneSection onOpenPicker={() => undefined} />);
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: /跟随系统/ }));
		});
		expect(screen.getByRole("alert")).toHaveTextContent("没有保存");
		expect(screen.getByRole("radio", { name: /跟随系统/ })).not.toBeChecked();
	});
});

describe("the picker", () => {
	test("shortcuts come first, the whole list is ordered by offset, and a search narrows it", async () => {
		state.deviceZone = "Asia/Singapore";
		show(<TimeZonePicker onDone={() => undefined} />);
		expect(screen.getByText("当前设备时区")).toBeInTheDocument();
		expect(screen.getByText("北京时间")).toBeInTheDocument();
		const options = screen.getAllByRole("radio");
		const offsets = options.map((option) => {
			const text = option.closest("label")?.textContent ?? "";
			const match = /UTC([+-])(\d+)(?::(\d+))?/.exec(text);
			return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : Number.NaN;
		});
		const finite = offsets.filter((value) => Number.isFinite(value));
		expect(finite.length).toBeGreaterThan(100);
		expect(finite).toEqual([...finite].sort((left, right) => left - right));

		const search = screen.getByRole("searchbox", { name: /搜索城市或时区/ });
		fireEvent.change(search, { target: { value: "shanghai" } });
		expect(screen.getAllByRole("radio")).toHaveLength(1);
		expect(screen.getByRole("radio", { name: /上海/ })).toBeInTheDocument();
	});

	test("choosing a zone locks it and returns; a failure keeps the list up and says why", async () => {
		const done = vi.fn();
		show(<TimeZonePicker onDone={done} />);
		const search = screen.getByRole("searchbox", { name: /搜索城市或时区/ });
		fireEvent.change(search, { target: { value: "shanghai" } });
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: /上海/ }));
		});
		expect(saves.at(-1)).toEqual({ timezone: { mode: "manual", zone: "Asia/Shanghai" } });
		expect(done).toHaveBeenCalledTimes(1);
	});

	test("a search with no match says so rather than showing an empty card", () => {
		show(<TimeZonePicker onDone={() => undefined} />);
		fireEvent.change(screen.getByRole("searchbox", { name: /搜索城市或时区/ }), { target: { value: "zzzz" } });
		expect(screen.getByText("没有匹配的时区。")).toBeInTheDocument();
	});
});

describe("the language row", () => {
	test.each([
		["zh-CN" as Locale, /跟随系统（当前：中文）/],
		["en" as Locale, /Follow this device \(now: English\)/],
	] as const)("%s names the device language it would follow", (locale, followLabel) => {
		state.locale = locale;
		state.deviceLocale = locale;
		show(<LanguageSection />, locale);
		expect(screen.getByRole("radio", { name: followLabel })).toBeChecked();
		expect(screen.getByRole("radio", { name: "中文" })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: "English" })).toBeInTheDocument();
	});

	test("choosing a language locks it through the adapter", async () => {
		show(<LanguageSection />);
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: "English" }));
		});
		expect(saves.at(-1)).toEqual({ locale: { mode: "manual", value: "en" } });
	});

	test("choosing follow clears the lock", async () => {
		state.localeMode = "manual";
		state.locale = "en";
		show(<LanguageSection />);
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: /跟随系统/ }));
		});
		expect(saves.at(-1)).toEqual({ locale: { mode: "auto" } });
	});

	test("a locked language is the one checked", () => {
		state.localeMode = "manual";
		state.locale = "en";
		state.deviceLocale = "zh-CN";
		show(<LanguageSection />);
		const english = screen.getByRole("radio", { name: "English" });
		expect(english).toBeChecked();
		expect(within(english.closest("li") as HTMLElement).getByRole("radio", { name: "English" })).toBe(english);
	});
});
