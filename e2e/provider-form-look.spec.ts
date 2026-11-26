import { mkdir } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import type { DiscoverModelsRequest, SaveProviderRequest } from "@yonder/protocol";
import { isolateChat } from "./chat-fixture.ts";

/** Where the screenshots go; the operator points this at a scratch folder. */
const dir = process.env.YONDER_PREVIEW_DIR;

async function capture(page: Page, name: string) {
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await page.screenshot({ path: `${dir}/${name}.png`, animations: "disabled", scale: "css", fullPage: true });
}

/**
 * The provider form as a person meets it: what the address hint says for each protocol, what the
 * model table looks like when empty and after discovery, and whether the effort control is one
 * multi-select rather than five loose checkboxes.
 */
async function setup(page: Page) {
	await isolateChat(page);
	await page.emulateMedia({ reducedMotion: "reduce" });
	const received: DiscoverModelsRequest[] = [];
	let failWith: { status: number; body: unknown } | null = null;
	await page.route("**/v1/providers/models", async (route) => {
		if (failWith) {
			await route.fulfill({ status: failWith.status, json: failWith.body });
			return;
		}
		// The app's own discovery call, answered as the server would answer it.
		received.push(route.request().postDataJSON() as DiscoverModelsRequest);
		await route.fulfill({
			json: {
				models: ["claude-opus-5-5", "claude-sonnet-5-5", "deepseek-v4.1-flash", "glm-5.3-flash"],
				metadata: { "claude-opus-5-5": { contextLength: 1000000 } },
			},
		});
	});
	await page.route("**/v1/providers", async (route) => {
		if (route.request().method() === "POST") {
			const body = route.request().postDataJSON() as SaveProviderRequest;
			await route.fulfill({ json: { id: "prv_00000000000000000000000009", scope: "user", ...body } });
			return;
		}
		await route.fulfill({ json: { items: [], platformModels: [] } });
	});
	return {
		received,
		fail(status: number, message: string) {
			failWith = { status, body: { error: { code: "invalid_request", message } } };
		},
	};
}

test("the provider form: protocols, address hints and the model table", async ({ page }) => {
	const server = await setup(page);
	const received = server.received;
	await page.goto("/me/models/add");
	await page.getByRole("button", { name: "自定义供应商" }).click();

	await page.getByLabel("名称").fill("RightCode");
	await page.getByLabel("备注").fill("公司专用账号");
	await page.getByLabel("请求地址").fill("https://www.rightapi.ai");
	await page.getByLabel("API Key").fill("sk-test");
	await capture(page, "01-empty");
	// The model table is below the fold: scroll it into view for its own picture.
	await page.getByRole("textbox", { name: "显示名" }).first().scrollIntoViewIfNeeded();
	await capture(page, "01b-model-table");

	for (const protocol of ["OpenAI Responses", "Anthropic Messages", "Gemini generateContent"]) {
		await page.getByRole("button", { name: /^协议: / }).click();
		await page.getByRole("option", { name: protocol }).click();
		await capture(page, `02-protocol-${protocol.split(" ")[0].toLowerCase()}`);
	}
	await page.getByRole("button", { name: /^协议: / }).click();
	await page.getByRole("option", { name: "OpenAI Chat Completions" }).click();

	await page.getByRole("button", { name: "获取模型列表" }).click();
	await expect(page.getByRole("textbox", { name: "请求模型" }).first()).toHaveValue("claude-opus-5-5");
	await capture(page, "03-discovered");

	// The effort control: one multi-select that opens, not five checkboxes in the row.
	await page
		.getByRole("button", { name: /^思考档位: / })
		.first()
		.click();
	await capture(page, "04-effort-open");
	await page.getByRole("option", { name: /high/ }).click();
	await capture(page, "05-effort-chosen");

	// A failed discovery says what the server said, so "protocol is invalid" is not hidden.
	server.fail(400, '"protocol" is invalid');
	await page.getByRole("button", { name: "获取模型列表" }).click();
	await expect(page.getByRole("alert")).toContainText('"protocol" is invalid');
	await capture(page, "06-failure-reason");
	expect(received.length).toBe(1);
});
