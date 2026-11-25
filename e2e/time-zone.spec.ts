import { expect, type Page, test } from "@playwright/test";
import { isolateChat, message } from "./chat-fixture.ts";

/**
 * 时区：every instant is read in the account's zone (2026-11-25). Three browser zones run the same
 * fixtures: with the account locked to Asia/Shanghai the times must not move with the browser, and
 * in `auto` they must follow it — which is what proves the zone is the account's, not the machine's.
 *
 * Stage 1 keeps the choice in this browser's storage (`yonder.timezone*`); the same rows read the
 * server's `me.timezone` once that lands.
 */

const INSTANT = "2026-11-25T11:58:15Z";
const EXPECTED = {
	"Asia/Singapore": { locked: "19:58", auto: "19:58" },
	"America/New_York": { locked: "19:58", auto: "06:58" },
	"Asia/Shanghai": { locked: "19:58", auto: "19:58" },
} as const;

/** One message at the fixed instant, and an account whose only choice is the stored zone. */
async function isolateZone(page: Page, options: { locale?: "zh-CN" | "en" } = {}) {
	await page.addInitScript(({ locale }) => localStorage.setItem("yonder.locale", locale), {
		locale: options.locale ?? "zh-CN",
	});
	return isolateChat(page, {
		locale: options.locale ?? "zh-CN",
		items: [{ ...message("message-01", "时区检查", false), createdAt: INSTANT }],
	});
}

/** The items list with one task that started at `startedAt`, for the day-group tests. */
async function isolateItems(page: Page, startedAt: string) {
	await isolateZone(page);
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

/**
 * Store the account's zone the way 「通用」 writes it in stage 1, and read a clock on the page.
 * `addInitScript` runs before the document, so storage is writable without a first navigation.
 */
async function setZone(page: Page, mode: "auto" | "manual", zone = "Asia/Shanghai") {
	await page.addInitScript(
		({ mode, zone }) => {
			if (mode === "manual") localStorage.setItem("yonder.timezone", zone);
			else localStorage.removeItem("yonder.timezone");
			localStorage.setItem("yonder.timezone-mode", mode);
		},
		{ mode, zone },
	);
}

for (const zone of Object.keys(EXPECTED) as (keyof typeof EXPECTED)[]) {
	test.describe(`browser in ${zone}`, () => {
		test.use({ timezoneId: zone });

		test("a locked account reads the same clock here, on the account's zone", async ({ page }) => {
			await setZone(page, "manual");
			await isolateZone(page);
			await page.goto("/messages/chat-route-check");
			// 11:58Z is 19:58 in Shanghai whichever zone this browser is in.
			// The label carries its date too; the clock is the part that must not move.
			await expect(page.locator("time").first()).toContainText(EXPECTED[zone].locked);
		});

		test("an auto account reads this browser's clock", async ({ page }) => {
			await setZone(page, "auto");
			await isolateZone(page);
			await page.goto("/messages/chat-route-check");
			await expect(page.locator("time").first()).toContainText(EXPECTED[zone].auto);
		});
	});
}

test.describe("the timeline's day split", () => {
	test.use({ timezoneId: "America/New_York" });

	/**
	 * The same item, 2026-11-24T16:30Z, under an account locked to Shanghai and one following this
	 * New York browser at 09:00 on the 25th (04:30 on the 24th in Shanghai). In Shanghai the item is
	 * that morning — the 25th, 今天; in New York it is the 24th, 昨天.
	 */
	test("2026-11-24T16:30Z is the 25th in Shanghai and the 24th in New York", async ({ page }) => {
		await isolateItems(page, "2026-11-24T16:30:00Z");

		// Shanghai is the account's zone, and its clock says it is the 25th.
		await page.clock.install({ time: new Date("2026-11-25T10:00:00+08:00") });
		await setZone(page, "manual", "Asia/Shanghai");
		await page.goto("/tasks");
		await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(/今天/);

		// Auto follows this New York browser; the same instant is the 24th, 昨天 there.
		await page.clock.setFixedTime(new Date("2026-11-25T09:00:00-05:00"));
		await setZone(page, "auto");
		await page.reload();
		await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(/昨天/);
	});
});

test.describe("today and yesterday across midnight", () => {
	test.use({ timezoneId: "Asia/Shanghai" });

	test("one minute before the account's midnight still reads 今天; one after reads 昨天", async ({ page }) => {
		await isolateItems(page, "2026-11-25T12:00:00+08:00");
		await setZone(page, "manual", "Asia/Shanghai");
		await page.clock.install({ time: new Date("2026-11-25T23:59:00+08:00") });
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
		await setZone(page, "auto");
		await isolateZone(page);
		await page.goto("/me/general");

		// The follow row names the zone this browser is in.
		const follow = page.getByRole("radio", { name: /跟随系统（当前：新加坡 UTC\+8）/ });
		await expect(follow).toBeChecked();

		await page.getByRole("radio", { name: "手动选择" }).click();
		await expect(page.getByRole("heading", { name: "时区" })).toBeVisible();
		const search = page.getByRole("searchbox", { name: "搜索城市或时区" });
		await expect(page.getByText("当前设备时区")).toBeVisible();
		await expect(page.getByText("北京时间")).toBeVisible();

		// Offsets run in order: a negative offset row precedes a positive one.
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
		await page.getByRole("radio", { name: /上海/ }).click();
		// Choosing returns to 通用, where the row now says the zone is locked.
		await expect(page.getByRole("radio", { name: "手动选择" })).toBeChecked();
		await expect(page.getByText("已锁定：北京时间 UTC+8")).toBeVisible();
		await expect(page.getByText("此设备是 新加坡 UTC+8")).toBeVisible();

		// Back to following this browser: the lock goes, and so does the second line.
		await page.getByRole("radio", { name: /跟随系统（当前：新加坡 UTC\+8）/ }).click();
		await expect(page.getByRole("radio", { name: /跟随系统（当前：新加坡 UTC\+8）/ })).toBeChecked();
		await expect(page.getByText("此设备是 新加坡 UTC+8")).toHaveCount(0);
	});

	test("the same rows read in English", async ({ page }) => {
		await setZone(page, "auto");
		await isolateZone(page, { locale: "en" });
		await page.goto("/me/general");
		await expect(page.getByRole("radio", { name: "Follow this device (now: Singapore UTC+8)" })).toBeChecked();
		await page.getByRole("radio", { name: "Choose a time zone…" }).click();
		await page.getByRole("searchbox", { name: "Search a city or a zone" }).fill("new york");
		await page.getByRole("radio", { name: /New York/ }).click();
		await expect(page.getByRole("radio", { name: "Choose a time zone…" })).toBeChecked();
		// November is standard time in New York; the offset is computed for now, never assumed.
		await expect(page.getByText(/Locked: New York UTC-[45]/)).toBeVisible();
		await expect(page.getByText("This device is Singapore UTC+8")).toBeVisible();
		await expect(page.getByRole("radio", { name: "English", exact: true })).toBeChecked();
	});

	test("a language choice locks, and following the device comes back", async ({ page }) => {
		await setZone(page, "auto");
		await isolateZone(page);
		await page.goto("/me/general");
		// The fixture starts this account on 简体中文 (a lock); switching to English is a real change.
		await expect(page.getByRole("heading", { name: "外观" })).toBeVisible();
		await page.getByRole("radio", { name: "English", exact: true }).click();
		await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
		await expect(page.getByRole("radio", { name: "English", exact: true })).toBeChecked();
		// Following this device returns to its own language, and the rows are in it again.
		await page.getByRole("radio", { name: /Follow this device \(now: English\)/ }).click();
		await expect(page.getByRole("radio", { name: "English", exact: true })).not.toBeChecked();
		await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
	});

	test("a save the device refuses shows the real reason and keeps the old choice", async ({ page }) => {
		await page.addInitScript(() => {
			const setItem = Storage.prototype.setItem;
			Storage.prototype.setItem = function (key: string, value: string) {
				// The probe that picks browser storage passes; the preference write itself does not.
				if (key.startsWith("yonder.timezone")) throw new DOMException("quota", "QuotaExceededError");
				setItem.call(this, key, value);
			};
		});
		await setZone(page, "auto");
		await isolateZone(page);
		await page.goto("/me/general");
		await page.getByRole("radio", { name: "手动选择" }).click();
		await page.getByRole("searchbox", { name: "搜索城市或时区" }).fill("shanghai");
		await page.getByRole("radio", { name: /上海/ }).click();
		// The list stays up and says what happened; nothing claims the zone was saved.
		await expect(page.getByRole("alert")).toContainText("没有保存");
		await expect(page.getByRole("heading", { name: "时区" })).toBeVisible();
	});
});
