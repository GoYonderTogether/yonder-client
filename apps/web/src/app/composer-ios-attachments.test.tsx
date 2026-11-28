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

function renderIphone(major: number, overrides: Partial<ComposerProps> = {}, native = true) {
	if (native) vi.stubGlobal("__TAURI_INTERNALS__", {});
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

test("iPhone Plus opens an icon grid and Album chooses ordered photos across sources", async () => {
	invoke.mockImplementation(async (name: string, args) => {
		if (name === command("photo_access")) return "full";
		if (name === command("photo_albums")) return [{ id: "trip", title: "Trip" }];
		if (name === command("photo_page")) {
			return args.albumId
				? { assets: [{ id: "trip-photo", createdAt: 1 }], more: false }
				: { assets: [{ id: "recent-photo", createdAt: 2 }], more: false };
		}
		if (name === command("photo_thumbnail")) return [];
		if (name === command("take")) return [1, 2, 3];
		if (name === command("pick")) {
			args.result.onmessage({
				files: [
					{ index: 0, name: "recent.png", mime: "image/png" },
					{ index: 1, name: "trip.png", mime: "image/png" },
				],
			});
		}
	});
	const { attach, onFiles } = renderIphone(16, { onMeeting: vi.fn() });
	attach();
	const tray = within(screen.getByRole("button", { name: "Album" }).closest("fieldset") as HTMLFieldSetElement);
	expect(tray.getAllByRole("button").map((button) => button.textContent)).toEqual([
		"Album",
		"Camera",
		"Files",
		"Recording notes",
	]);
	expect(invoke).not.toHaveBeenCalled();
	fireEvent.click(tray.getByRole("button", { name: "Album" }));
	expect(await screen.findByRole("dialog", { name: "Album" })).toBeVisible();
	fireEvent.click(await screen.findByRole("button", { name: "Select photo 1" }));
	fireEvent.click(await screen.findByRole("button", { name: "Recent photos" }));
	fireEvent.click(screen.getByRole("button", { name: "Trip" }));
	await waitFor(() =>
		expect(invoke).toHaveBeenCalledWith(command("photo_page"), { albumId: "trip", offset: 0, limit: 36 }),
	);
	const trip = await screen.findByRole("button", { name: "Select photo 1", pressed: false });
	fireEvent.click(trip);
	expect(trip).toHaveTextContent("2");
	fireEvent.click(screen.getByRole("button", { name: "Add (2)" }));
	await waitFor(() =>
		expect(invoke).toHaveBeenCalledWith(command("pick"), {
			session: expect.any(String),
			documents: false,
			camera: false,
			photoIds: ["recent-photo", "trip-photo"],
			allowPhotoFit: false,
			limit: 10,
			result: expect.anything(),
		}),
	);
	await waitFor(() =>
		expect(onFiles).toHaveBeenCalledExactlyOnceWith([
			expect.objectContaining({ name: "recent.png", type: "image/png" }),
			expect.objectContaining({ name: "trip.png", type: "image/png" }),
		]),
	);
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
	expect(screen.getByRole("button", { name: "Album" })).toBeEnabled();
	fireEvent.click(screen.getByRole("button", { name: "Files" }));
	await waitFor(() =>
		expect(invoke).toHaveBeenCalledWith(command("pick"), {
			session: expect.any(String),
			documents: true,
			camera: false,
			photoIds: undefined,
			allowPhotoFit: false,
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

test("an open Album refreshes after limited Photos access changes", async () => {
	let permission = "undetermined";
	let permitted = false;
	vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
	invoke.mockImplementation(async (name: string, args) => {
		if (name === command("photo_access")) {
			if (args.request) permission = "limited";
			return permission;
		}
		if (name === command("photo_albums")) return [];
		if (name === command("photo_page"))
			return { assets: permitted ? [{ id: "permitted", createdAt: null }] : [], more: false };
		if (name === command("photo_thumbnail")) return [];
	});
	const { attach } = renderIphone(17);
	attach();
	expect(invoke).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Album" }));
	const allow = await screen.findByRole("button", { name: "Allow recent photos" });
	expect(invoke).not.toHaveBeenCalledWith(command("photo_access"), { request: true });
	fireEvent.click(allow);
	expect(await screen.findByRole("button", { name: "Manage access" })).toBeEnabled();
	permitted = true;
	act(() => void window.dispatchEvent(new Event("yonder-ios-photo-library-change")));
	expect(await screen.findByRole("button", { name: "Select photo 1" })).toBeEnabled();
	expect(invoke).toHaveBeenCalledWith(command("photo_access"), { request: true });
	expect(invoke).toHaveBeenCalledWith(command("photo_page"), { albumId: null, offset: 0, limit: 36 });
});

test("confirmed Album selections and Files send independently, while Camera failure sends nothing", async () => {
	invoke.mockImplementation(async (name: string, args) => {
		if (name === command("photo_access")) return "full";
		if (name === command("photo_albums")) return [];
		if (name === command("photo_page")) return { assets: [{ id: "photo", createdAt: null }], more: false };
		if (name === command("photo_thumbnail")) return [];
		if (name === command("pick")) {
			if (args.camera) args.result.onmessage({ issue: "cameraUnavailable" });
			else
				args.result.onmessage({
					files: [{ index: 0, name: args.documents ? "file.png" : "photo.png", mime: "image/png" }],
				});
		}
		if (name === command("take")) return [1, 2, 3];
	});
	const directSend = vi.fn();
	const { attach, onSend, onFiles } = renderIphone(17, {
		pickedFiles: { send: directSend, retry: vi.fn(), discard: vi.fn(), failed: false },
	});
	attach();
	fireEvent.click(screen.getByRole("button", { name: "Album" }));
	fireEvent.click(await screen.findByRole("button", { name: "Select photo 1" }));
	fireEvent.click(screen.getByRole("button", { name: "Preview" }));
	await waitFor(() => expect(invoke).toHaveBeenCalledWith(command("photo_thumbnail"), { id: "photo", preview: true }));
	fireEvent.click(screen.getByRole("button", { name: "Back to photos" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "Send original" }));
	fireEvent.click(screen.getByRole("button", { name: "Send (1)" }));
	await waitFor(() =>
		expect(directSend).toHaveBeenNthCalledWith(1, [expect.objectContaining({ name: "photo.png" })], true),
	);

	expect(invoke).toHaveBeenCalledWith(
		command("pick"),
		expect.objectContaining({
			photoIds: ["photo"],
			allowPhotoFit: false,
		}),
	);

	attach();
	fireEvent.click(await screen.findByRole("button", { name: "Camera" }));
	expect(await screen.findByText("Camera unavailable on this device.")).toBeVisible();
	expect(directSend).toHaveBeenCalledTimes(1);

	fireEvent.click(screen.getByRole("button", { name: "Send file" }));
	await waitFor(() =>
		expect(directSend).toHaveBeenNthCalledWith(2, [expect.objectContaining({ name: "file.png" })], true),
	);
	expect(invoke).toHaveBeenCalledWith(command("pick"), expect.objectContaining({ camera: true, allowPhotoFit: false }));
	expect(invoke).toHaveBeenCalledWith(
		command("pick"),
		expect.objectContaining({ documents: true, allowPhotoFit: false }),
	);

	attach();
	fireEvent.click(screen.getByRole("button", { name: "Album" }));
	fireEvent.click(await screen.findByRole("button", { name: "Select photo 1" }));
	expect(screen.getByRole("checkbox", { name: "Send original" })).not.toBeChecked();
	fireEvent.click(screen.getByRole("button", { name: "Send (1)" }));
	await waitFor(() =>
		expect(directSend).toHaveBeenNthCalledWith(3, [expect.objectContaining({ name: "photo.png" })], false),
	);
	expect(invoke).toHaveBeenCalledWith(
		command("pick"),
		expect.objectContaining({ photoIds: ["photo"], allowPhotoFit: true }),
	);

	expect(onFiles).not.toHaveBeenCalled();
	expect(onSend).not.toHaveBeenCalled();
	expect(screen.getByRole("textbox")).toHaveValue("Unsent text");
});

test("mobile Web uses its actual image input without accepting a result from an old conversation", () => {
	const directSend = vi.fn();
	const { attach, onFiles, switchChat } = renderIphone(
		17,
		{ pickedFiles: { send: directSend, retry: vi.fn(), discard: vi.fn(), failed: false } },
		false,
	);
	const photo = new File(["photo"], "one.png", { type: "image/png" });
	attach();
	fireEvent.click(screen.getByRole("button", { name: "Album" }));
	fireEvent.change(screen.getByLabelText("Upload images"), { target: { files: [photo] } });
	expect(directSend).toHaveBeenCalledExactlyOnceWith([photo], false);
	attach();
	fireEvent.click(screen.getByRole("button", { name: "Send file" }));
	switchChat();
	fireEvent.change(screen.getByLabelText("Upload files"), { target: { files: [photo] } });
	expect(directSend).toHaveBeenCalledTimes(1);
	expect(onFiles).not.toHaveBeenCalled();
	expect(screen.getByRole("textbox")).toHaveValue("Unsent text");
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
