// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Attachment } from "@yonder/protocol";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getAttachmentDownloadItem, MessageAttachments } from "../pages/message-attachments.tsx";

const { cached, fetchContent, readChatCache } = vi.hoisted(() => ({
	cached: new Map<string, Blob>(),
	fetchContent: vi.fn(),
	readChatCache: vi.fn(),
}));

vi.mock("@yonder/ui-data", () => ({
	useApi: () => api,
	usePerson: () => ({ id: "me" }),
	attachmentCacheKey: (_owner: string, id: string) => id,
	chatCacheGeneration: () => 0,
	readChatCache,
	writeChatCache: async (key: string, blob: Blob) => cached.set(key, blob),
}));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => (key === "landingPage.nav.download" ? "Download" : key),
		i18n: { resolvedLanguage: "en" },
	}),
}));
vi.mock("../lib/image-display.ts", () => ({
	ensureDisplayBlob: async (blob: Blob) => blob,
}));

const api = { attachmentContent: fetchContent };
const file: Attachment = { id: "report", name: "report.txt", kind: "file", mimeType: "text/plain", size: 4096 };
const first: Attachment = { ...file, id: "first", name: "first.png", mimeType: "image/png" };
const second: Attachment = { ...first, id: "second", name: "second.png" };
const download = vi.fn<(name: string, url: string) => void>();

beforeEach(() => {
	cached.clear();
	fetchContent.mockReset();
	readChatCache.mockReset().mockImplementation(async (id: string) => cached.get(id));
	download.mockClear();
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.stubGlobal(
		"matchMedia",
		vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
	);
	vi.stubGlobal(
		"URL",
		class extends URL {
			static createObjectURL(blob: Blob) {
				return `blob:original-${blob.size}`;
			}
			static revokeObjectURL() {}
		},
	);
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
		download(this.download, this.href);
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function item(name: string) {
	const target = screen.getByText(name);
	const row = getAttachmentDownloadItem(target);
	if (!row) throw new Error("Missing attachment download row");
	return row;
}

test("resolves a download row only for a registered tile or its descendants", () => {
	render(<MessageAttachments attachments={[file]} />);
	const target = screen.getByText(file.name);
	expect(getAttachmentDownloadItem(target)).toMatchObject({ id: "download", label: "Download" });
	expect(getAttachmentDownloadItem(target.closest("[data-attachment-id]"))).toBe(item(file.name));
	expect(getAttachmentDownloadItem(document.createElement("div"))).toBeUndefined();
	expect(getAttachmentDownloadItem(null)).toBeUndefined();
});

test("downloads cached original bytes without fetching", async () => {
	cached.set(file.id, new Blob(["cached"]));
	render(<MessageAttachments attachments={[file]} />);
	await act(item(file.name).run);
	expect(download).toHaveBeenCalledExactlyOnceWith(file.name, "blob:original-6");
	expect(fetchContent).not.toHaveBeenCalled();
});

test("fetches an uncached original before downloading it", async () => {
	fetchContent.mockResolvedValue(new Blob(["remote original"]));
	render(<MessageAttachments attachments={[file]} />);
	await act(item(file.name).run);
	expect(fetchContent).toHaveBeenCalledExactlyOnceWith(file.id);
	expect(download).toHaveBeenCalledExactlyOnceWith(file.name, "blob:original-15");
});

test.each([file, first])("failed fetch for $name exposes the tile's retry state", async (attachment) => {
	fetchContent.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Blob(["retry"]));
	render(<MessageAttachments attachments={[attachment]} />);
	const target = screen.getByRole("button", { name: `Open ${attachment.name}` });
	const row = getAttachmentDownloadItem(target);
	if (!row) throw new Error("Missing attachment download row");
	await act(row.run);
	expect(download).not.toHaveBeenCalled();
	expect(screen.getByText("chat.attachmentFailed · app.retry")).toBeInTheDocument();
	await act(row.run);
	expect(fetchContent).toHaveBeenCalledTimes(2);
	expect(download).toHaveBeenCalledExactlyOnceWith(attachment.name, "blob:original-5");
	expect(screen.queryByText("chat.attachmentFailed · app.retry")).toBeNull();
});

test("right-click bubbles and downloading from the second image uses only its original", async () => {
	const contextMenu = vi.fn();
	fetchContent.mockResolvedValue(new Blob(["second"]));
	render(
		<div ref={(node) => node?.addEventListener("contextmenu", contextMenu)}>
			<MessageAttachments attachments={[first, second]} />
		</div>,
	);
	const target = screen.getByRole("button", { name: "Open second.png" });
	expect(fireEvent.contextMenu(target)).toBe(true);
	expect(contextMenu).toHaveBeenCalledTimes(1);
	await act(getAttachmentDownloadItem(target)?.run ?? (() => Promise.reject(new Error("Missing action"))));
	expect(fetchContent).toHaveBeenCalledExactlyOnceWith(second.id);
	expect(download).toHaveBeenCalledExactlyOnceWith(second.name, "blob:original-6");
});

test("swipe and arrow keys switch images in the same reader and history entry", async () => {
	fetchContent.mockResolvedValue(new Blob(["image"]));
	render(<MessageAttachments attachments={[first, file, second]} />);
	fireEvent.click(screen.getByRole("button", { name: "Open first.png" }));
	const dialog = await screen.findByRole("dialog", { name: "Preview first.png" });
	const historyEntry = history.state.attachmentPreview;
	const image = await within(dialog).findByRole("img", { name: first.name });
	expect(within(dialog).getByText("1 / 2")).toBeInTheDocument();
	expect(fireEvent.contextMenu(image)).toBe(true);
	fireEvent.pointerDown(image, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 210, clientY: 100 });
	fireEvent.pointerMove(image, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 120, clientY: 100 });
	fireEvent.pointerUp(image, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 120, clientY: 100 });
	await within(dialog).findByRole("img", { name: second.name });
	expect(within(dialog).getByText("2 / 2")).toBeInTheDocument();
	expect(history.state.attachmentPreview).toBe(historyEntry);
	fireEvent.keyDown(dialog, { key: "ArrowRight" });
	expect(within(dialog).getByText("2 / 2")).toBeInTheDocument();
	fireEvent.keyDown(dialog, { key: "ArrowLeft" });
	await within(dialog).findByText("1 / 2");
	expect(fetchContent.mock.calls).toEqual([[first.id], [second.id]]);
	fireEvent.click(within(dialog).getByTitle("Close preview"));
	await waitFor(() => expect(dialog).not.toBeInTheDocument());
});
