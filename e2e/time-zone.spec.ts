import { expect, type Page, test } from "@playwright/test";
import { bot, isolateChat, message, person } from "./chat-fixture.ts";

/**
 * 时区：every instant is read in the account's zone (2026-11-25). Three browser zones run the same
 * fixtures: with the account locked to Asia/Shanghai the times must not move with the browser, and
 * in `auto` they must follow the account's resolved zone — which is what proves the zone is the
 * account's, not the machine's.
 *
 * The account's zone comes from `me.timezone`, the server's answer. A test chooses it by answering
 * `/v1/me` itself; this is also how 「another device changed it」 is staged, with no restart.
 */

const INSTANT = "2026-11-25T11:58:15Z";
const EXPECTED = {
	"Asia/Singapore": { locked: "19:58", auto: "19:58" },
	"America/New_York": { locked: "19:58", auto: "06:58" },
	"Asia/Shanghai": { locked: "19:58", auto: "19:58" },
} as const;

/** One message at the fixed instant, and an account whose zone answer the test controls. */
async function isolateZone(
	page: Page,
	options: { locale?: "zh-CN" | "en"; timezone?: string; mode?: "auto" | "manual" } = {},
) {
	await page.addInitScript(({ locale }) => localStorage.setItem("yonder.locale", locale), {
		locale: options.locale ?? "zh-CN",
	});
	const zone = options.timezone ?? "Asia/Shanghai";
	const mode = options.mode ?? "manual";
	const harness = await isolateChat(page, {
		locale: options.locale ?? "zh-CN",
		timezone: zone,
		items: [{ ...message("message-01", "时区检查", false), createdAt: INSTANT }],
	});
	// The fixture answers `me` with an auto account on a fixed zone; a test that needs a lock answers
	// for itself, above the fixture's route.
	if (mode === "manual") await overrideMe(page, zone, options.locale ?? "zh-CN");
	return harness;
}

/** A `MeResponse` with the given zone and language answers; the shape the server sends. */
function meAnswer(options: {
	timezone: { mode: "auto" | "manual"; zone: string; device?: string | null };
	locale?: { mode: "auto" | "manual"; value: "zh-CN" | "en"; device?: "zh-CN" | "en" | null };
}) {
	const locale = options.locale ?? { mode: "manual", value: "zh-CN" as const };
	return {
		member: person,
		bot,
		hasPassword: true,
		signInMethods: [],
		settings: { locale: locale.value, theme: "light" },
		timezone: {
			mode: options.timezone.mode,
			zone: options.timezone.zone,
			manual: options.timezone.mode === "manual" ? options.timezone.zone : null,
			device: options.timezone.device ?? options.timezone.zone,
		},
		locale: {
			mode: locale.mode,
			value: locale.value,
			manual: locale.mode === "manual" ? locale.value : null,
			device: locale.device ?? locale.value,
		},
	};
}

/** Answer `/v1/me` with a manual lock on `zone`, the refreshed answer a save produces too. */
async function overrideMe(page: Page, zone: string, locale: "zh-CN" | "en") {
	await page.route("**/v1/me", (route) =>
		route.fulfill({
			json: meAnswer({ timezone: { mode: "manual", zone }, locale: { mode: "manual", value: locale } }),
		}),
	);
}

/** The items list with one task that started at `startedAt`, and a fake clock for the day groups. */
async function isolateItems(page: Page, startedAt: string, zone: string, mode: "auto" | "manual" = "manual") {
	await isolateZone(page, { timezone: zone, mode });
	await page.route(
		(url) => url.pathname.startsWith("/v1/items"),
		(route) =>
			route.fulfill({
				json: {
					items: [
						{
							id: "item_day",
							source: "subtask",
							title: "跨日的任务",
							state: "completed",
							botMemberId: "chat-bot",
							conversationId: "chat-route-check",
							startedAt,
							endedAt: null,
							result: "做完",
							failureReason: null,
						},
					],
					nextCursor: null,
				},
			}),
	);
}

for (const zone of Object.keys(EXPECTED) as (keyof typeof EXPECTED)[]) {
	test.describe(`browser in ${zone}`, () => {
		test.use({ timezoneId: zone });

		test("a locked account reads the same clock here, on the account's zone", async ({ page }) => {
			await isolateZone(page, { timezone: "Asia/Shanghai" });
			await page.goto("/messages/chat-route-check");
			// 11:58Z is 19:58 in Shanghai whichever zone this browser is in.
			await expect(page.locator("time").first()).toContainText(EXPECTED[zone].locked);
		});

		test("an auto account reads the zone the account resolved", async ({ page }) => {
			// The account follows its device, and the last device it heard from was this one.
			await isolateZone(page, { mode: "auto", timezone: zone });
			await page.goto("/messages/chat-route-check");
			await expect(page.locator("time").first()).toContainText(EXPECTED[zone].auto);
		});
	});
}

test.describe("the timeline's day split", () => {
	test.use({ timezoneId: "America/New_York" });

	/**
	 * The same item, 2026-11-24T16:30Z, read in two account zones: Shanghai's clock says it is the
	 * 25th (今天), New York's says the 24th (昨天).
	 */
	test("2026-11-24T16:30Z is the 25th in Shanghai and the 24th in New York", async ({ page }) => {
		await page.clock.install({ time: new Date("2026-11-25T10:00:00+08:00") });
		await isolateItems(page, "2026-11-24T16:30:00Z", "Asia/Shanghai");
		await page.goto("/tasks");
		await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(/今天/);
	});

	test("the same item under a New York account is 昨天", async ({ page }) => {
		await page.clock.install({ time: new Date("2026-11-25T09:00:00-05:00") });
		await isolateItems(page, "2026-11-24T16:30:00Z", "America/New_York");
		await page.goto("/tasks");
		await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(/昨天/);
	});
});

test.describe("today and yesterday across midnight", () => {
	test.use({ timezoneId: "Asia/Shanghai" });

	test("one minute before the account's midnight still reads 今天; one after reads 昨天", async ({ page }) => {
		await page.clock.install({ time: new Date("2026-11-25T23:59:00+08:00") });
		await isolateItems(page, "2026-11-25T12:00:00+08:00", "Asia/Shanghai");
		await page.goto("/tasks");
		await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(/今天/);

		await page.clock.setFixedTime(new Date("2026-11-26T00:01:00+08:00"));
		await page.reload();
		await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(/昨天/);
	});
});

test.describe("「通用」· 时区与语言", () => {
	test.use({ timezoneId: "Asia/Singapore" });

	test("manual first opens the picker, the list is searchable and ordered, and the lock reads back", async ({
		page,
	}) => {
		await isolateZone(page, { timezone: "Asia/Singapore", mode: "auto" });
		await page.goto("/me/general");

		// The follow row says which zone this device is in, and it is the account's answer.
		await expect(page.getByRole("radio", { name: /跟随系统（当前：新加坡 UTC\+8）/ })).toBeChecked();

		await page.getByRole("radio", { name: "手动选择" }).click();
		await expect(page.getByRole("heading", { name: "时区" })).toBeVisible();
		const search = page.getByRole("searchbox", { name: "搜索城市或时区" });
		await expect(page.getByText("当前设备时区")).toBeVisible();
		await expect(page.getByText("北京时间")).toBeVisible();

		const offsets = await page
			.getByRole("radio")
			.evaluateAll((options) =>
				options.map((option) => /UTC([+-])(\d+)(?::(\d+))?/.exec(option.closest("label")?.textContent ?? "")),
			);
		const values = offsets
			.filter((match): match is RegExpExecArray => match !== null)
			.map((match) => (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)));
		expect(values.length).toBeGreaterThan(100);
		expect(values).toEqual([...values].sort((left, right) => left - right));

		await search.fill("shanghai");
		await expect(page.getByRole("radio")).toHaveCount(1);
		// Answer the save with the server's refreshed answer, as the real endpoint does.
		await page.route("**/v1/me/preferences", (route) =>
			route.fulfill({
				json: meAnswer({ timezone: { mode: "manual", zone: "Asia/Shanghai", device: "Asia/Singapore" } }),
			}),
		);
		await page.getByRole("radio", { name: /上海/ }).click();
		await expect(page.getByRole("radio", { name: "手动选择" })).toBeChecked();
		await expect(page.getByText("已锁定：北京时间 UTC+8")).toBeVisible();
	});

	test("the zone row shows the device the server remembers when it differs from the lock", async ({ page }) => {
		await isolateZone(page, { timezone: "Asia/Shanghai" });
		await page.route("**/v1/me", (route) =>
			route.fulfill({
				json: meAnswer({
					timezone: { mode: "manual", zone: "Asia/Shanghai", device: "America/New_York" },
				}),
			}),
		);
		await page.goto("/me/general");
		await expect(page.getByText("已锁定：北京时间 UTC+8")).toBeVisible();
		await expect(page.getByText("此设备是 纽约 UTC-5")).toBeVisible();
	});

	test("a zone the server refuses shows its own reason and keeps the old choice", async ({ page }) => {
		await isolateZone(page, { timezone: "Asia/Singapore", mode: "auto" });
		await page.route("**/v1/me/preferences", (route) =>
			route.fulfill({
				status: 400,
				json: {
					error: { code: "invalid_timezone", message: "unknown IANA time zone", details: { field: "timezone" } },
				},
			}),
		);
		await page.goto("/me/general");
		await page.getByRole("radio", { name: "手动选择" }).click();
		await page.getByRole("searchbox", { name: "搜索城市或时区" }).fill("shanghai");
		await page.getByRole("radio", { name: /上海/ }).click();
		await expect(page.getByRole("alert")).toContainText("无法识别这个时区");
		await expect(page.getByRole("heading", { name: "时区" })).toBeVisible();
	});

	test("the same rows read in English", async ({ page }) => {
		await isolateZone(page, { locale: "en", timezone: "Asia/Singapore", mode: "auto" });
		await page.goto("/me/general");
		await expect(page.getByRole("radio", { name: "Follow this device (now: Singapore UTC+8)" })).toBeChecked();
		await page.getByRole("radio", { name: "Choose a time zone…" }).click();
		await page.getByRole("searchbox", { name: "Search a city or a zone" }).fill("new york");
		await page.route("**/v1/me/preferences", (route) =>
			route.fulfill({
				json: meAnswer({
					timezone: { mode: "manual", zone: "America/New_York", device: "Asia/Singapore" },
					locale: { mode: "manual", value: "en", device: "en" },
				}),
			}),
		);
		await page.getByRole("radio", { name: /New York/ }).click();
		await expect(page.getByRole("radio", { name: "Choose a time zone…" })).toBeChecked();
		await expect(page.getByText(/Locked: New York UTC-[45]/)).toBeVisible();
		await expect(page.getByRole("radio", { name: "English", exact: true })).toBeChecked();
	});

	test("a language choice locks through the endpoint, and the rows change language", async ({ page }) => {
		await isolateZone(page, { timezone: "Asia/Singapore", mode: "auto" });
		await page.route("**/v1/me/preferences", (route) => {
			const body = route.request().postDataJSON() as { locale?: { mode: "auto" | "manual"; value?: "zh-CN" | "en" } };
			const requested = body.locale ?? { mode: "manual" as const, value: "en" as const };
			return route.fulfill({
				json: meAnswer({
					timezone: { mode: "auto", zone: "Asia/Singapore" },
					locale: {
						mode: requested.mode,
						value: requested.mode === "manual" ? (requested.value ?? "en") : "en",
						device: "en",
					},
				}),
			});
		});
		await page.goto("/me/general");
		// The fixture starts this account on 简体中文.
		await expect(page.getByRole("heading", { name: "外观" })).toBeVisible();
		await page.getByRole("radio", { name: "English", exact: true }).click();
		await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
		await expect(page.getByRole("radio", { name: "English", exact: true })).toBeChecked();
		// Following this device returns to its own language, and the rows are in it again.
		await page.getByRole("radio", { name: /Follow this device \(now: English\)/ }).click();
		await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
	});

	test("another device's lock is read on the next `me`, with no restart", async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem("yonder.locale", "zh-CN"));
		const harness = await isolateChat(page, {
			locale: "zh-CN",
			timezone: "Asia/Singapore",
			items: [{ ...message("message-01", "时区检查", false), createdAt: INSTANT }],
		});
		// Registered after the fixture's answer, so this one is the newest and wins.
		let zone = "Asia/Singapore";
		await page.route("**/v1/me", (route) =>
			route.fulfill({ json: meAnswer({ timezone: { mode: "manual", zone, device: zone } }) }),
		);
		await page.goto("/messages/chat-route-check");
		await expect(page.locator("time").first()).toContainText("19:58");

		// The other device locks the account to New York; this window reads `me` again on its next
		// load and follows it, with nothing restarted.
		zone = "America/New_York";
		await page.reload();
		await expect(page.locator("time").first()).toContainText("06:58");
		void harness;
	});
});
