import { resolve } from "node:path";
import { devices, expect, type Locator, type Page, type Request, test } from "@playwright/test";
import type { Attachment, SendMessageRequest } from "@yonder/protocol";
import { conversation, isolateChat, message, person } from "./chat-fixture.ts";

const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
const sample = resolve("e2e/fixtures/attachment-preview/audio.wav");
test.use({
	...phone,
	reducedMotion: "reduce",
	launchOptions: {
		args: [
			"--use-fake-device-for-media-stream",
			"--use-fake-ui-for-media-stream",
			`--use-file-for-fake-audio-capture=${sample}`,
		],
	},
});

const words = "请把这一段语音记下来";
const friend = {
	...conversation,
	id: "chat-with-friend",
	isPrimary: false,
	pinned: false,
	members: [
		{
			memberId: person.id,
			kind: "person" as const,
			handle: person.handle,
			displayName: person.displayName,
			avatarUrl: null,
		},
		{ memberId: "chat-friend", kind: "person" as const, handle: "friend", displayName: "验收好友", avatarUrl: null },
	],
};

async function speechWire(page: Page) {
	await isolateChat(page, { items: [] });
	await page.route("**/v1/conversations", (route) => route.fulfill({ json: { items: [conversation, friend] } }));
	const recognized: Buffer[] = [];
	const uploaded = new Map<string, { attachment: Attachment; bytes: Buffer }>();
	const sent: { path: string; body: SendMessageRequest }[] = [];
	await page.route("**/v1/audio/transcriptions", async (route) => {
		recognized.push((await wav(route.request())).bytes);
		await route.fulfill({ json: { text: words } });
	});
	await page.route("**/v1/attachments", async (route) => {
		const { bytes, name } = await wav(route.request());
		const attachment: Attachment = {
			id: `voice-${uploaded.size + 1}`,
			kind: "audio",
			name,
			mimeType: "audio/wav",
			size: bytes.length,
		};
		uploaded.set(attachment.id, { attachment, bytes });
		await route.fulfill({ json: attachment });
	});
	await page.route("**/v1/attachments/*/content", async (route) => {
		const id = new URL(route.request().url()).pathname.split("/").at(-2) ?? "";
		const file = uploaded.get(id);
		if (!file) throw new Error(`Missing uploaded audio ${id}`);
		await route.fulfill({ body: file.bytes, contentType: file.attachment.mimeType });
	});
	await page.route("**/v1/conversations/*/messages", async (route) => {
		const request = route.request();
		if (request.method() !== "POST") return route.fallback();
		const path = new URL(request.url()).pathname;
		const body = request.postDataJSON() as SendMessageRequest;
		const items = (body.attachmentIds ?? []).map((id) => {
			const file = uploaded.get(id);
			if (!file) throw new Error(`Unknown attachment ${id}`);
			return file.attachment;
		});
		sent.push({ path, body });
		await route.fulfill({
			json: {
				message: {
					...message(`sent-${sent.length + 10}`, body.body || null, true),
					conversationId: path.split("/").at(-2),
					attachments: items,
					clientNonce: body.clientNonce,
					voice: body.voice?.transcribe ? { durationMs: body.voice.durationMs, transcription: "pending" } : body.voice,
				},
				clientNonce: body.clientNonce,
			},
		});
	});
	return { recognized, uploaded, sent };
}

async function wav(request: Request) {
	const body = request.postDataBuffer();
	const type = request.headers()["content-type"];
	if (!body || !type) throw new Error("Voice request did not have a multipart body");
	const form = await new globalThis.Request(request.url(), {
		method: "POST",
		headers: { "content-type": type },
		body: new Uint8Array(body),
	}).formData();
	const file = form.get("file");
	if (!(file instanceof File)) throw new Error("Voice request did not contain a file");
	const bytes = Buffer.from(await file.arrayBuffer());
	expect(file.type).toBe("audio/wav");
	expect(bytes.toString("ascii", 0, 12)).toMatch(/^RIFF.{4}WAVE$/s);
	expect(bytes.readUInt32LE(4)).toBe(bytes.length - 8);
	expect(bytes.readUInt16LE(20)).toBe(1);
	expect(bytes.readUInt16LE(22)).toBe(1);
	expect(bytes.readUInt32LE(24)).toBe(16_000);
	expect(bytes.readUInt16LE(34)).toBe(16);
	expect(bytes.length).toBeGreaterThan(44 + 16_000 * 2 * 0.15);
	expect(bytes.subarray(44).some((byte) => byte !== 0)).toBe(true);
	return { bytes, name: file.name };
}

async function pressToTalk(page: Page, button: Locator, hint = "松手发语音") {
	await expect(button).toBeEnabled();
	const box = await button.boundingBox();
	if (!box) throw new Error("Press-to-talk button is outside the screen");
	const session = await page.context().newCDPSession(page);
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
	await expect(page.locator(".composer-recording-label")).toHaveText(hint, { timeout: 15_000 });
	return {
		move: (dx: number, dy: number) =>
			session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx, y: y + dy }] }),
		release: async (type: "touchEnd" | "touchCancel" = "touchEnd") => {
			await session.send("Input.dispatchTouchEvent", { type, touchPoints: [] });
			await session.detach();
		},
	};
}

test("a slow microphone shows the pressed effect immediately and late capture cannot send", async ({ page }, info) => {
	await page.addInitScript(() => {
		const getMicrophone = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
		let attempts = 0;
		navigator.mediaDevices.getUserMedia = async (constraints) => {
			const attempt = String(++attempts);
			document.body.dataset.pendingMicrophone = attempt;
			await new Promise<void>((resolve) =>
				window.addEventListener("test:microphone-ready", () => resolve(), { once: true }),
			);
			const stream = await getMicrophone(constraints);
			const track = stream.getAudioTracks()[0];
			if (!track) throw new Error("Expected a microphone track");
			const stop = track.stop.bind(track);
			track.stop = () => {
				stop();
				document.body.dataset.stoppedMicrophone = attempt;
			};
			return stream;
		};
	});
	const wire = await speechWire(page);
	await page.goto("/messages/main");
	await page.getByRole("button", { name: "语音输入", exact: true }).tap();
	const hold = page.getByRole("button", { name: "按住说话", exact: true });
	const overlay = page.locator(".composer-recording");
	const body = page.locator("body");
	for (const attempt of ["1", "2"]) {
		const press = await pressToTalk(page, hold, "正在启动录音…");
		await expect(hold).toHaveText("按住说话");
		await expect(body).toHaveAttribute("data-pending-microphone", attempt);
		await expect(overlay).toBeVisible();
		if (attempt === "1") {
			await page.screenshot({ path: info.outputPath("mobile-recording-starting.png"), scale: "css" });
			await press.release();
		} else {
			await page.evaluate(() => {
				Object.defineProperty(document, "hidden", { configurable: true, value: true });
				document.dispatchEvent(new Event("visibilitychange"));
				Reflect.deleteProperty(document, "hidden");
			});
			await press.release();
		}
		await expect(overlay).toHaveCount(0);
		await page.evaluate(() => window.dispatchEvent(new Event("test:microphone-ready")));
		await expect(body).toHaveAttribute("data-stopped-microphone", attempt);
	}
	expect(wire.sent).toEqual([]);
	expect(wire.uploaded.size).toBe(0);
	expect(wire.recognized).toEqual([]);
	const press = await pressToTalk(page, hold, "正在启动录音…");
	await expect(body).toHaveAttribute("data-pending-microphone", "3");
	await page.evaluate(() => window.dispatchEvent(new Event("test:microphone-ready")));
	await expect(overlay.locator(".composer-recording-label")).toHaveText("松手发语音");
	await page.waitForTimeout(700); // Leave enough real audio to pass the minimum-duration guard on release.
	expect(wire.sent).toEqual([]);
	await press.release();
	await expect
		.poll(() => wire.sent)
		.toMatchObject([
			{
				path: `/v1/conversations/${conversation.id}/messages`,
				body: { body: "", voice: { durationMs: expect.any(Number), transcribe: true } },
			},
		]);
	await expect(page.getByRole("button", { name: /^播放语音/ })).toBeVisible();
});

test("recording feedback shows a shallow arc and changes the glow on an upward swipe", async ({ page }, info) => {
	await page.routeWebSocket(
		(url) => url.pathname === "/v1/audio/transcriptions/realtime",
		(socket) => {
			socket.onMessage((message) => {
				if (typeof message !== "string") return;
				const start = JSON.parse(message);
				if (start.type !== "start") return;
				socket.send(JSON.stringify({ type: "ready", sessionId: start.sessionId }));
				socket.send(
					JSON.stringify({
						type: "transcript",
						sessionId: start.sessionId,
						sentenceId: 1,
						text: words,
					}),
				);
			});
		},
	);
	await page.addInitScript(() => {
		// Capture a browser-generated tone so this visual test does not wait for the host audio device.
		navigator.mediaDevices.getUserMedia = async () => {
			const context = new AudioContext();
			const output = context.createMediaStreamDestination();
			const tone = context.createOscillator();
			tone.connect(output);
			tone.start();
			const [track] = output.stream.getAudioTracks();
			if (!track) throw new Error("Synthetic audio track is missing");
			const stop = track.stop.bind(track);
			track.stop = () => {
				stop();
				tone.stop();
				void context.close();
			};
			await context.resume();
			return output.stream;
		};
	});
	const history = [
		"把明天的评审安排整理一下。",
		"首页、账单页和上线顺序都列好了。",
		"账单页要等新版截图，放到最后。",
		"好。首页先确认移动端导航和输入栏，再确认桌面布局。",
		"数据就用上次准备好的那一份。",
		"我会把评审清单补到任务里。",
		"开会时间改到下午三点。",
	];
	await isolateChat(page, {
		items: history.map((body, index) => message(`message-0${index}`, body, index % 2 === 0)),
	});
	await page.goto("/messages/main");
	await page.getByRole("button", { name: "语音输入", exact: true }).tap();
	const hold = page.getByRole("button", { name: "按住说话", exact: true });
	const overlay = page.locator(".composer-recording");
	const label = overlay.locator(".composer-recording-label");
	await expect(overlay).toHaveCount(0);
	const recording = await pressToTalk(page, hold);
	await expect(hold).toHaveText("按住说话");
	await expect(overlay.locator(".composer-recording-transcript")).toHaveText(words);
	await expect(overlay.locator(".composer-recording-target-right")).toHaveText("滑到这里 转文字");
	await expect(page.locator(".composer-box")).toHaveCSS("opacity", "0.28");
	await expect(label.locator("*")).toHaveCount(0);
	await expect(overlay).toHaveCSS("position", "fixed");
	await expect(overlay).toHaveCSS("pointer-events", "none");
	const viewport = page.viewportSize();
	if (!viewport) throw new Error("Mobile viewport is missing");
	expect(await overlay.boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
	const labelBounds = await label.boundingBox();
	if (!labelBounds) throw new Error("Recording label is missing");
	const labelBottom = viewport.height - labelBounds.y - labelBounds.height;
	expect(labelBounds.y).toBeGreaterThan(viewport.height * 0.3);
	expect(labelBottom).toBeGreaterThan(viewport.height * 0.4);
	const glow = () =>
		overlay.evaluate((element) => {
			const style = getComputedStyle(element);
			const wide = getComputedStyle(element, "::before");
			const center = getComputedStyle(element, "::after");
			return {
				color: style.getPropertyValue("--recording-glow").trim(),
				accent: style.getPropertyValue("--color-accent").trim(),
				danger: style.getPropertyValue("--color-danger").trim(),
				shade: style.backgroundColor,
				gradient: wide.backgroundImage,
				baseRadius: Number.parseFloat(wide.height),
				wideMask: wide.maskImage,
				centerMask: center.maskImage,
				wideBlur: Number.parseFloat(wide.backdropFilter.slice(5)),
				centerBlur: Number.parseFloat(center.backdropFilter.slice(5)),
			};
		});
	const normal = await glow();
	expect(normal.color).toBe(normal.accent);
	expect(normal.shade).toContain("0.16");
	// Chromium serializes a circle with a single radius and omits the shape keyword.
	const radial = /radial-gradient\((?:circle )?(\d+(?:\.\d+)?)px at 50% calc\(100% \+ (\d+(?:\.\d+)?)px\),/g;
	const [rim, tint] = normal.gradient.matchAll(radial);
	const [wide] = normal.wideMask.matchAll(radial);
	const [center] = normal.centerMask.matchAll(radial);
	if (!rim || !tint || !wide || !center) throw new Error("The recording arc or one of its masks is missing");
	const radius = Number(wide[1]);
	const offset = Number(wide[2]);
	expect(radius).toBeCloseTo(normal.baseRadius * 2, 1);
	expect(offset).toBeGreaterThan(normal.baseRadius);
	expect(radius - offset).toBeGreaterThan(100);
	expect(rim.slice(1)).toEqual(wide.slice(1));
	expect(tint.slice(1)).toEqual(wide.slice(1));
	expect(Number(center[1])).toBeCloseTo(radius * 0.9, 1);
	expect(center[2]).toBe(wide[2]);
	expect(normal.wideBlur).toBeGreaterThan(0);
	expect(normal.centerBlur).toBeGreaterThan(normal.wideBlur);
	await recording.move(0, -18);
	await expect(label).toHaveText("松手发语音");
	await recording.move(24, 0);
	await expect(label).toHaveText("松手发语音");
	await page.screenshot({ path: info.outputPath("mobile-recording-arc-blue.png"), scale: "css" });
	await recording.move(-65, -75);
	await expect(label).toHaveText("松手取消");
	const cancel = await glow();
	expect(cancel.color).toBe(cancel.danger);
	expect(cancel).toMatchObject({ shade: normal.shade, wideMask: normal.wideMask, centerMask: normal.centerMask });
	expect(cancel.gradient.split(", radial-gradient")[0]).toBe(normal.gradient.split(", radial-gradient")[0]);
	expect(cancel.gradient).not.toBe(normal.gradient);
	expect(await label.boundingBox()).toEqual(labelBounds);
	await page.screenshot({ path: info.outputPath("mobile-recording-arc-red.png"), scale: "css" });
	await recording.move(0, -12);
	await expect(label).toHaveText("松手发语音");
	expect(await glow()).toEqual(normal);
	await recording.release("touchCancel");
	await expect(overlay).toHaveCount(0);
	await expect(page.locator(".composer-box")).toHaveCSS("opacity", "1");
});

test("empty mobile composer holds one line; a held recording sends one playable voice message on release", async ({
	page,
}, info) => {
	const wire = await speechWire(page);
	await page.goto("/messages/main");
	const composer = page.locator(".composer-box");
	const input = composer.getByRole("textbox");
	const mic = composer.getByRole("button", { name: "语音输入", exact: true });
	const send = composer.getByRole("button", { name: "发送", exact: true });
	await expect(input).toHaveValue("");
	await expect(input).toHaveJSProperty("placeholder", "");
	await expect(mic).toBeEnabled();
	await expect(send).toHaveCount(0);
	await expect(composer.getByRole("button")).toHaveCount(2);
	const emptyHeight = (await composer.boundingBox())?.height ?? 0;
	expect(emptyHeight).toBeGreaterThan(32);
	expect(emptyHeight).toBeLessThan(58);
	await page.screenshot({ path: info.outputPath("mobile-empty-text.png"), scale: "css" });

	const text = "手机文字输入";
	await input.fill(text);
	await expect(send).toBeEnabled();
	await expect(mic).toBeEnabled();
	expect((await composer.boundingBox())?.height).toBeCloseTo(emptyHeight, 0);
	await send.tap();
	await expect.poll(() => wire.sent).toMatchObject([{ body: { body: text } }]);
	await expect(input).toHaveValue("");
	await expect(mic).toBeEnabled();

	await mic.tap();
	const hold = composer.getByRole("button", { name: "按住说话", exact: true });
	const keyboard = composer.getByRole("button", { name: "文字输入", exact: true });
	const overlay = page.locator(".composer-recording");
	const label = overlay.locator(".composer-recording-label");
	await expect(hold).toBeVisible();
	await expect(overlay).toHaveCount(0);
	await expect(keyboard).toBeVisible();
	await expect(input).not.toBeVisible();
	await expect(send).toHaveCount(0);
	expect((await composer.boundingBox())?.height).toBeCloseTo(emptyHeight, 0);
	await page.screenshot({ path: info.outputPath("mobile-voice.png"), scale: "css" });

	const recording = await pressToTalk(page, hold);
	await page.waitForTimeout(2200); // Leave time to observe play, pause and resume in the recorded fixture audio.
	expect(wire.sent).toHaveLength(1);
	expect(wire.uploaded.size).toBe(0);
	expect(wire.recognized).toHaveLength(0);
	await recording.move(0, -56);
	await expect(label).toHaveText("松手取消");
	await recording.move(0, -12);
	await expect(label).toHaveText("松手发语音");
	await recording.release();
	await expect(overlay).toHaveCount(0);
	await expect
		.poll(() => wire.sent)
		.toMatchObject([
			{ body: { body: text } },
			{
				path: `/v1/conversations/${conversation.id}/messages`,
				body: {
					type: "voice",
					body: "",
					attachmentIds: ["voice-1"],
					voice: { durationMs: expect.any(Number), transcribe: true },
				},
			},
		]);
	expect(wire.recognized).toHaveLength(0);
	const audio = wire.uploaded.get("voice-1");
	if (!audio) throw new Error("No uploaded audio");
	const durationMs = wire.sent[1]?.body.voice?.durationMs;
	expect(durationMs).toBeGreaterThan(150);
	const voice = page.getByRole("button", { name: /^播放语音/ });
	await expect(voice).toBeVisible();
	await expect(voice).toHaveText(`${Math.ceil((durationMs ?? 0) / 1000)}″`);
	await expect(page.getByRole("button", { name: `打开 ${audio.attachment.name}`, exact: true })).toHaveCount(0);
	await expect(page.getByRole("log").getByText(words, { exact: true })).toHaveCount(0);
	await page.screenshot({ path: info.outputPath("mobile-voice-sent.png"), scale: "css" });
	const pause = page.getByRole("button", { name: /^暂停语音/ });
	// The sent voice bar is re-rendered once the server confirms the message; on a slow runner the
	// first tap can land on the copy being replaced. Tap again until playback starts.
	await expect(async () => {
		if (await voice.isVisible()) await voice.tap({ timeout: 2_000 });
		await expect(pause).toHaveAttribute("data-voice-state", "playing", { timeout: 4_000 });
	}).toPass({ timeout: 20_000 });
	await pause.tap();
	await expect(voice).toHaveAttribute("data-voice-state", "paused");
	await Promise.all([expect(pause).toHaveAttribute("data-voice-state", "playing"), voice.tap()]);
	await expect(voice).toHaveAttribute("data-voice-state", "idle");
	await keyboard.tap();
	await expect(input).toHaveValue("");
	await expect(mic).toBeVisible();
	expect(wire.sent).toHaveLength(2);
});

test("cancelled or departed presses stay local; a friend gets audio without a transcription request", async ({
	page,
}, info) => {
	const wire = await speechWire(page);
	await page.goto("/messages/main");
	const mic = page.getByRole("button", { name: "语音输入", exact: true });
	const hold = page.getByRole("button", { name: "按住说话", exact: true });
	const overlay = page.locator(".composer-recording");
	await mic.tap();
	const swipe = await pressToTalk(page, hold);
	await page.waitForTimeout(700);
	await swipe.move(0, -56);
	await expect(overlay.locator(".composer-recording-label")).toHaveText("松手取消");
	await swipe.release();
	await expect(overlay).toHaveCount(0);

	const cancel = await pressToTalk(page, hold);
	await page.waitForTimeout(700);
	await cancel.release("touchCancel");
	await expect(overlay).toHaveCount(0);

	const releaseAfterNavigation = await pressToTalk(page, hold);
	await page.waitForTimeout(700);
	await page.getByRole("button", { name: "消息", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
	await expect(page).toHaveURL(/\/messages$/);
	await releaseAfterNavigation.release();
	await expect(overlay).toHaveCount(0);
	expect(wire.sent).toEqual([]);
	expect(wire.uploaded.size).toBe(0);
	expect(wire.recognized).toHaveLength(0);

	await page.getByRole("button", { name: /验收好友/ }).tap();
	await expect(page).toHaveURL(/\/messages\/chat-with-friend$/);
	await mic.tap();
	const sendToFriend = await pressToTalk(page, hold);
	await page.waitForTimeout(2200);
	await sendToFriend.release();
	await expect
		.poll(() => wire.sent)
		.toMatchObject([
			{
				path: `/v1/conversations/${friend.id}/messages`,
				body: { type: "voice", body: "", attachmentIds: ["voice-1"], voice: { durationMs: expect.any(Number) } },
			},
		]);
	expect(wire.uploaded.size).toBe(1);
	expect(wire.recognized).toHaveLength(0);
	const voice = page.getByRole("button", { name: /^播放语音/ });
	await expect(voice).toBeVisible();
	await page.screenshot({ path: info.outputPath("mobile-friend-voice.png"), scale: "css" });
	await Promise.all([
		expect(page.getByRole("button", { name: /^暂停语音/ })).toBeVisible({ timeout: 15_000 }),
		voice.tap(),
	]);
});

test("reaching 60 seconds locks one recording, restores it in the same chat, and only sends on tap", async ({
	page,
}, info) => {
	await page.addInitScript(() => {
		const Worklet = AudioWorkletNode;
		window.AudioWorkletNode = class extends Worklet {
			constructor(...args: ConstructorParameters<typeof AudioWorkletNode>) {
				super(...args);
				window.addEventListener(
					"test:voice-minute",
					() => {
						const pcm = new Int16Array(1600).fill(600);
						for (let index = 0; index < 600; index++)
							this.port.onmessage?.(new MessageEvent("message", { data: pcm.buffer }));
					},
					{ once: true },
				);
			}
		};
	});
	const wire = await speechWire(page);
	await page.goto("/messages/main");
	await page.getByRole("button", { name: "语音输入", exact: true }).tap();
	const hold = page.getByRole("button", { name: "按住说话", exact: true });
	const press = await pressToTalk(page, hold);
	await page.evaluate(() => window.dispatchEvent(new Event("test:voice-minute")));
	const locked = page.getByRole("group", { name: "已锁定录音" });
	await expect(locked).toBeVisible();
	await expect(locked.getByText("1:00")).toBeVisible();
	await press.release();
	await expect(locked).toBeVisible();
	expect(wire.sent).toHaveLength(0);
	await page.screenshot({ path: info.outputPath("voice-locked.png"), scale: "css" });
	await page.reload();
	const recovered = page.getByRole("group", { name: "已恢复录音" });
	await expect(recovered.getByRole("button", { name: "继续录音" })).toBeVisible();
	await page.screenshot({ path: info.outputPath("voice-recovered.png"), scale: "css" });
	expect(wire.sent).toHaveLength(0);
	await recovered.getByRole("button", { name: "结束并发送" }).tap();
	await expect
		.poll(() => wire.sent)
		.toMatchObject([{ body: { body: "", voice: { transcribe: true, durationMs: expect.any(Number) } } }]);
	const duration = wire.sent[0]?.body.voice?.durationMs ?? 0;
	expect(duration).toBeGreaterThanOrEqual(60_000);
	const upload = wire.uploaded.values().next().value;
	expect(Math.ceil((upload?.bytes.readUInt32LE(40) ?? 0) / 32)).toBe(duration);
	expect(wire.recognized).toHaveLength(0);
	await expect(page.getByText("正在转成文字…", { exact: true })).toBeVisible();
});

test("a right swipe edits the transcript and leaves sending up to the user", async ({ page }, info) => {
	const wire = await speechWire(page);
	await page.goto("/messages/main");
	const composer = page.locator(".composer-box");
	await composer.getByRole("textbox").fill("原有草稿");
	await composer.getByRole("button", { name: "语音输入", exact: true }).tap();
	const press = await pressToTalk(page, composer.getByRole("button", { name: "按住说话", exact: true }));
	await page.waitForTimeout(500);
	await press.move(75, -80);
	await expect(page.locator(".composer-recording-label")).toHaveText("松手编辑");
	await expect(page.locator(".composer-recording-target-right")).toHaveText("编辑");
	await press.move(0, 0);
	await expect(page.locator(".composer-recording-label")).toHaveText("松手发语音");
	await press.move(75, 0);
	await expect(page.locator(".composer-recording-label")).toHaveText("松手编辑");
	await page.screenshot({ path: info.outputPath("voice-to-text.png"), scale: "css" });
	await press.release();
	await expect(composer.getByRole("textbox")).toHaveValue(`原有草稿\n${words}`);
	expect(wire.recognized).toHaveLength(1);
	expect(wire.uploaded.size).toBe(0);
	expect(wire.sent).toHaveLength(0);
});

test("a tap still focuses the empty editor, while a hold dictates without sending", async ({ page }, info) => {
	const wire = await speechWire(page);
	await page.goto("/messages/main");
	const composer = page.locator(".composer-box");
	const input = composer.getByRole("textbox");
	await expect(composer.getByText("按住转文字")).toBeVisible();
	await input.tap();
	await expect(input).toBeFocused();
	await input.blur();
	const held = await pressToTalk(page, input, "松手编辑");
	await page.waitForTimeout(500);
	await held.move(-65, -45);
	await expect(page.locator(".composer-recording-label")).toHaveText("松手取消");
	await expect(page.locator(".composer-recording-target-right")).toHaveText("编辑");
	await held.move(0, 0);
	await expect(page.locator(".composer-recording-label")).toHaveText("松手编辑");
	await page.screenshot({ path: info.outputPath("voice-hold-editor.png"), scale: "css" });
	await held.release();
	await expect(input).toHaveValue(words);
	expect(wire.recognized).toHaveLength(1);
	expect(wire.sent).toHaveLength(0);
});
