// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { Composer } from "./composer.tsx";
import type { ComposerProps } from "./composer-props.ts";

const { invoke, api } = vi.hoisted(() => ({ invoke: vi.fn(), api: {} }));
vi.mock("@tauri-apps/api/core", () => ({
	invoke,
	Channel: class {
		onmessage: (value: unknown) => void;
		constructor(onmessage: (value: unknown) => void) {
			this.onmessage = onmessage;
		}
	},
}));
vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	useApi: () => api,
}));
vi.mock("../lib/image-display.ts", async (original) => ({
	...(await original<typeof import("../lib/image-display.ts")>()),
	ensureDisplayBlob: async (blob: Blob) => blob,
}));
vi.mock("../preview/document-thumbnail.ts", () => ({ createDocumentThumbnail: async () => ({}) }));
vi.mock("./use-voice-input.ts", () => ({ useVoiceInput: () => ({ isListening: false, error: "", cancel: vi.fn() }) }));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	invoke.mockReset();
});

const command = (name: string) => `plugin:yonder-ios-chat-attachments|${name}`;

function pending() {
	let resolve!: (value: unknown) => void;
	const promise = new Promise<unknown>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function renderIphone(major: number, overrides: Partial<ComposerProps> = {}) {
	vi.stubGlobal("__TAURI_INTERNALS__", {});
	vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(`Mozilla/5.0 (iPhone; CPU iPhone OS ${major}_0)`);
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	const onFiles = vi.fn();
	const props: ComposerProps = {
		recipientName: null,
		draft: "Unsent text",
		onDraftChange: vi.fn(),
		onSend: vi.fn(),
		onFiles,
		streaming: false,
		disabled: false,
		disconnected: false,
		sendOnEnter: false,
		mobilePicker: true,
		...overrides,
	};
	const i18n = createI18n("en");
	const composer = (scope: string) => (
		<I18nextProvider i18n={i18n}>
			<Composer {...props} scope={scope} />
		</I18nextProvider>
	);
	const view = render(composer("chat-a"));
	const attach = () => fireEvent.click(screen.getByRole("button", { name: "Attach" }));
	return { attach, onFiles, onSend: props.onSend, switchChat: () => view.rerender(composer("chat-b")) };
}

test("iPhone rail selects in tap order, preserves selection after All Photos cancellation, and adds to the draft", async () => {
	const fullPicker = pending();
	const recentImport = pending();
	invoke.mockImplementation(async (name: string, args) => {
		if (name === command("photo_access")) return "full";
		if (name === command("photo_page")) {
			return {
				assets: [
					{ id: "most-recent", createdAt: 2 },
					{ id: "older", createdAt: 1 },
				],
			};
		}
		if (name === command("photo_thumbnail")) return [];
		if (name === command("take")) return [1, 2, 3];
		if (name !== command("pick")) return;
		void (args.allPhotos ? fullPicker : recentImport).promise.then(args.result.onmessage);
	});
	const htmlFileClick = vi.spyOn(HTMLInputElement.prototype, "click");
	const { attach, onFiles, onSend } = renderIphone(16);
	attach();

	const newer = await screen.findByRole("button", { name: "Select photo 1" });
	const older = screen.getByRole("button", { name: "Select photo 2" });
	expect(invoke).toHaveBeenCalledWith(command("photo_access"), { request: false });
	expect(invoke).not.toHaveBeenCalledWith(command("photo_access"), { request: true });
	expect(invoke.mock.calls.some(([name]) => name === command("pick"))).toBe(false);
	fireEvent.click(older);
	fireEvent.click(newer);
	expect(older).toHaveAttribute("aria-pressed", "true");
	expect(older).toHaveTextContent("1");
	expect(newer).toHaveTextContent("2");

	fireEvent.click(screen.getByRole("button", { name: "All photos" }));
	await waitFor(() =>
		expect(invoke).toHaveBeenCalledWith(command("pick"), {
			session: expect.any(String),
			documents: false,
			allPhotos: true,
			photoIds: undefined,
			limit: 10,
			result: expect.anything(),
		}),
	);
	await act(async () => fullPicker.resolve({}));
	const add = screen.getByRole("button", { name: "Add (2)" });
	expect(add).toBeEnabled();
	expect(onFiles).not.toHaveBeenCalled();

	fireEvent.click(add);
	expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
	await waitFor(() =>
		expect(invoke).toHaveBeenCalledWith(command("pick"), {
			session: expect.any(String),
			documents: false,
			allPhotos: false,
			photoIds: ["older", "most-recent"],
			limit: 10,
			result: expect.anything(),
		}),
	);
	await act(async () => {
		recentImport.resolve({
			files: [
				{ index: 0, name: "photo.heic", mime: "image/heic" },
				{ index: 1, name: "screenshot.png", mime: "image/png" },
			],
		});
	});
	expect(onFiles).toHaveBeenCalledExactlyOnceWith([
		expect.objectContaining({ name: "photo.heic", type: "image/heic", size: 3 }),
		expect.objectContaining({ name: "screenshot.png", type: "image/png", size: 3 }),
	]);
	expect(screen.getByRole("textbox")).toHaveValue("Unsent text");
	expect(onSend).not.toHaveBeenCalled();
	expect(htmlFileClick).not.toHaveBeenCalled();
});

test("Files opens directly without requesting photo access and discards a stale selection after switching drafts", async () => {
	const documents = pending();
	const documentStarted = pending();
	invoke.mockImplementation(async (name: string, args) => {
		if (name === command("photo_access")) return "undetermined";
		if (name !== command("pick")) return;
		void documents.promise.then(args.result.onmessage);
		await documentStarted.promise;
	});
	const htmlFileClick = vi.spyOn(HTMLInputElement.prototype, "click");
	const { attach, onFiles, switchChat } = renderIphone(17);
	attach();
	expect(await screen.findByRole("button", { name: "Allow recent photos" })).toBeEnabled();
	fireEvent.click(screen.getByRole("button", { name: "Files" }));
	await waitFor(() =>
		expect(invoke).toHaveBeenCalledWith(command("pick"), {
			session: expect.any(String),
			documents: true,
			allPhotos: false,
			photoIds: undefined,
			limit: 10,
			result: expect.anything(),
		}),
	);
	const docSession = invoke.mock.calls.find(([name]) => name === command("pick"))?.[1].session;
	switchChat();
	expect(invoke).not.toHaveBeenCalledWith(command("release"), { session: docSession });
	documentStarted.resolve(undefined);
	await waitFor(() => expect(invoke).toHaveBeenCalledWith(command("release"), { session: docSession }));
	await act(async () => {
		documents.resolve({ files: [{ index: 0, name: "old-chat.pdf", mime: "application/pdf" }] });
	});
	expect(invoke).not.toHaveBeenCalledWith(command("photo_access"), { request: true });
	expect(onFiles).not.toHaveBeenCalled();
	expect(htmlFileClick).not.toHaveBeenCalled();
});

test("recent photos asks permission only on its own action and displays limited authorization", async () => {
	invoke.mockImplementation(async (name: string, args) => {
		if (name === command("photo_access")) return args.request ? "limited" : "undetermined";
		if (name === command("photo_page")) return { assets: [{ id: "permitted", createdAt: null }] };
		if (name === command("photo_thumbnail")) return [];
	});
	const { attach } = renderIphone(17);
	attach();
	const allow = await screen.findByRole("button", { name: "Allow recent photos" });
	expect(invoke).not.toHaveBeenCalledWith(command("photo_access"), { request: true });
	fireEvent.click(allow);
	expect(await screen.findByRole("button", { name: "Select photo 1" })).toBeEnabled();
	expect(screen.getByRole("button", { name: "Manage access" })).toBeEnabled();
	expect(invoke).toHaveBeenCalledWith(command("photo_access"), { request: true });
	expect(invoke).toHaveBeenCalledWith(command("photo_page"), { offset: 0, limit: 24 });
});

test("iPhone draft photos show the thumbnail and original switch while documents retain their name", async () => {
	vi.stubGlobal(
		"URL",
		class extends URL {
			static createObjectURL() {
				return "blob:draft-photo";
			}
			static revokeObjectURL() {}
		},
	);
	const onOriginalFileChange = vi.fn();
	const jpeg = new Blob(["photo"], { type: "image/jpeg" });
	renderIphone(17, {
		onOriginalFileChange,
		files: [
			{
				id: "photo",
				blob: jpeg,
				mimeType: jpeg.type,
				name: "IMG_0001.jpg",
				imagePrepared: true,
				status: "ready",
				optimized: {
					blob: jpeg,
					name: "IMG_0001.jpg",
					mimeType: jpeg.type,
					width: 50,
					height: 100,
					nonce: "photo-thumb",
				},
			},
			{
				id: "doc",
				blob: new Blob(["notes"], { type: "text/plain" }),
				mimeType: "text/plain",
				name: "notes.txt",
				status: "ready",
			},
		],
	});

	const preview = screen.getByRole("button", { name: "Preview IMG_0001.jpg" });
	expect(await within(preview).findByRole("img")).toHaveAttribute("src", "blob:draft-photo");
	expect(preview).toHaveAttribute("data-iphone-photo", "true");
	expect(screen.queryByText("IMG_0001.jpg")).not.toBeInTheDocument();
	expect(screen.queryByText(/\bKB\b/)).not.toBeInTheDocument();
	expect(screen.queryByText("Optimized")).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Remove IMG_0001.jpg" })).toBeEnabled();
	expect(screen.getByText("notes.txt")).toBeVisible();

	const original = screen.getByRole("checkbox", { name: "Send original" });
	expect(original).not.toBeChecked();
	fireEvent.click(original);
	expect(onOriginalFileChange).toHaveBeenCalledExactlyOnceWith("photo", true);
});
