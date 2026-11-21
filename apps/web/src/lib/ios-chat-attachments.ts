import { isTauri } from "./keychain.ts";

export type IosAttachmentIssue = "pickFailed" | "fileTooLarge" | "tooManyFiles";
export type IosPhotoAccess = "undetermined" | "full" | "limited" | "denied" | "restricted";
export type IosRecentPhoto = { id: string; createdAt: number | null };

type PickedFile = { index: number; name: string; mime: string };
type PickResult = { files?: PickedFile[]; issue?: IosAttachmentIssue | null };

const plugin = "plugin:yonder-ios-chat-attachments|";

export function isIphoneAttachmentHost(): boolean {
	return isTauri() && /\biPhone\b/i.test(navigator.userAgent);
}

async function call<T>(name: string, args?: Record<string, unknown>) {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<T>(plugin + name, args);
}

export function getIphonePhotoAccess(request = false) {
	return call<IosPhotoAccess>("photo_access", { request });
}

export function manageIphonePhotoAccess() {
	return call<void>("manage_photo_access");
}

export async function listIphoneRecentPhotos() {
	const page = await call<{ assets: IosRecentPhoto[] }>("photo_page", { offset: 0, limit: 24 });
	return page.assets;
}

export async function readIphonePhotoThumbnail(id: string) {
	const bytes = await call<ArrayBuffer | number[]>("photo_thumbnail", { id });
	const buffer = Array.isArray(bytes) ? new Uint8Array(bytes) : bytes;
	return buffer.byteLength ? new Blob([buffer], { type: "image/jpeg" }) : undefined;
}

export async function pickIphoneAttachments({
	documents,
	allPhotos,
	photoIds,
	limit,
	signal,
	onImport,
}: {
	documents: boolean;
	allPhotos: boolean;
	photoIds: string[] | undefined;
	limit: number;
	signal: AbortSignal;
	onImport: () => void;
}): Promise<{ files: File[]; issue?: IosAttachmentIssue | null }> {
	const { Channel, invoke } = await import("@tauri-apps/api/core");
	if (signal.aborted) return { files: [] };
	const session = crypto.randomUUID();
	const command = <T>(name: string, args?: Record<string, unknown>) => invoke<T>(plugin + name, { session, ...args });
	let resolveSelection!: (value: PickResult | null) => void;
	const selection = new Promise<PickResult | null>((resolve) => {
		resolveSelection = resolve;
	});
	const result = new Channel<PickResult | { importing: true } | null>((event) => {
		if (signal.aborted) return;
		if (event && "importing" in event) onImport();
		else resolveSelection(event);
	});
	const started = command<void>("pick", { documents, allPhotos, photoIds, limit, result });
	let released = false;
	const release = () => {
		if (released) return;
		released = true;
		// A fast navigation can cancel the WebView before the native session has been registered.
		void started
			.catch(() => {})
			.then(() => command("release"))
			.catch(() => {});
	};
	const cancel = () => {
		resolveSelection(null);
		release();
	};
	signal.addEventListener("abort", cancel, { once: true });
	try {
		await started;
		const picked = await selection;
		if (signal.aborted) return { files: [] };
		if (!picked) throw new Error("attachment picker unavailable");
		const files: File[] = [];
		let issue = picked.issue;
		for (const { index, name, mime } of picked.files ?? []) {
			if (signal.aborted) return { files: [] };
			try {
				const bytes = await command<ArrayBuffer | number[]>("take", { index });
				files.push(new File([Array.isArray(bytes) ? new Uint8Array(bytes) : bytes], name, { type: mime }));
			} catch {
				issue ||= "pickFailed";
			}
		}
		return issue ? { files, issue } : { files };
	} finally {
		signal.removeEventListener("abort", cancel);
		release();
	}
}
