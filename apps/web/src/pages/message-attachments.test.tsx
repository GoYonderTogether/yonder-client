// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Attachment } from "@yonder/protocol";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ load: vi.fn(), loadCached: vi.fn(), blob: undefined as Blob | undefined }));
vi.mock("../preview/use-attachment-blob.ts", () => ({
	useAttachmentBlob: () => ({ ...state, loading: false, error: false, cacheError: false }),
}));
vi.mock("../lib/use-video-poster.ts", () => ({ useVideoPoster: () => undefined }));
vi.mock("../preview/preview-i18n.ts", () => ({
	usePreviewTranslation: () => (_key: string, values: { name: string }) => `Open ${values.name}`,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../preview/attachment-preview.tsx", () => ({
	AttachmentPreview: () => <div data-testid="reader">Full reader</div>,
}));

import { MessageAttachments } from "./message-attachments.tsx";

const file: Attachment = { id: "attachment", name: "report.txt", kind: "file", mimeType: "text/plain", size: 40960 };
beforeEach(() => {
	vi.clearAllMocks();
	state.blob = undefined;
	state.load.mockResolvedValue(new Blob(["document"]));
	state.loadCached.mockResolvedValue(undefined);
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			callback: IntersectionObserverCallback;
			constructor(callback: IntersectionObserverCallback) {
				this.callback = callback;
			}
			observe(target: Element) {
				this.callback(
					[{ isIntersecting: true, target }] as IntersectionObserverEntry[],
					this as unknown as IntersectionObserver,
				);
			}
			disconnect() {}
		},
	);
});
test("sent documents show one compact file card and never fetch text for an inline excerpt", async () => {
	const { container } = render(<MessageAttachments attachments={[file]} />);
	expect(screen.getByRole("button", { name: "Open report.txt" })).toBeInTheDocument();
	expect(container.querySelector("pre")).toBeNull();
	expect(container.querySelectorAll("button")).toHaveLength(1);
	expect(container).toHaveTextContent("TXT · 40 KB");
	expect(state.load).not.toHaveBeenCalled();
	expect(state.loadCached).toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button"));
	await waitFor(() => expect(screen.getByTestId("reader")).toBeInTheDocument());
});
test("an uncached sent video only checks local cache and never downloads merely to obtain a poster", () => {
	const { container } = render(
		<MessageAttachments attachments={[{ ...file, name: "clip.mp4", mimeType: "video/mp4" }]} />,
	);
	expect(state.loadCached).toHaveBeenCalled();
	expect(state.load).not.toHaveBeenCalled();
	expect(container.querySelector(".message-attachment-icon-play")).not.toBeNull();
	expect(container.querySelectorAll("button")).toHaveLength(1);
});
