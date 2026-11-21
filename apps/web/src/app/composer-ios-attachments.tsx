import { ChevronRight, FileAudio, FileText, Image, Images } from "lucide-react";
import { type RefObject, useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	getIphonePhotoAccess,
	type IosAttachmentIssue,
	type IosPhotoAccess,
	type IosRecentPhoto,
	isIphoneAttachmentHost,
	listIphoneRecentPhotos,
	manageIphonePhotoAccess,
	pickIphoneAttachments,
	readIphonePhotoThumbnail,
} from "../lib/ios-chat-attachments.ts";
import { useObjectUrl } from "../lib/use-object-url.ts";

type PickerMode = "recentPhotos" | "allPhotos" | "documents";
type PickerRequest = { scope: string; mode: PickerMode; photoIds?: string[]; limit: number };

export function useIosComposerAttachments({
	scope,
	mobile,
	enabled,
	limit,
	addButton,
	onFiles,
}: {
	scope: string;
	mobile: boolean;
	enabled: boolean;
	limit: number;
	addButton: RefObject<HTMLDivElement | null>;
	onFiles: (files: File[]) => void;
}) {
	const iphone = mobile && isIphoneAttachmentHost();
	const [panelScope, setPanelScope] = useState<string>();
	const [request, setRequest] = useState<PickerRequest>();
	const [importedRequest, setImportedRequest] = useState<PickerRequest>();
	const [issue, setIssue] = useState<{ scope: string; value: IosAttachmentIssue }>();
	const panel = useRef<HTMLFieldSetElement>(null);
	const open = enabled && iphone && panelScope === scope;
	const active = open && request?.scope === scope ? request : undefined;
	const importing = Boolean(active && (active.mode === "recentPhotos" || active === importedRequest));
	if (panelScope !== undefined && !open) {
		setPanelScope(undefined);
		setRequest(undefined);
		setImportedRequest(undefined);
	}
	const report = useEffectEvent((value: IosAttachmentIssue) => setIssue({ scope, value }));
	const receive = useEffectEvent((files: File[]) => onFiles(files));

	useLayoutEffect(() => {
		if (!active) return;
		const controller = new AbortController();
		void pickIphoneAttachments({
			documents: active.mode === "documents",
			allPhotos: active.mode === "allPhotos",
			photoIds: active.photoIds,
			limit: active.limit,
			signal: controller.signal,
			onImport: () => setImportedRequest(active),
		}).then(
			(result) => {
				if (controller.signal.aborted) return;
				setRequest(undefined);
				setImportedRequest(undefined);
				if (result.files.length) {
					setPanelScope(undefined);
					receive(result.files);
				}
				if (result.issue) report(result.issue);
			},
			() => {
				if (controller.signal.aborted) return;
				setRequest(undefined);
				setImportedRequest(undefined);
				report("pickFailed");
			},
		);
		return () => controller.abort();
	}, [active]);

	useLayoutEffect(() => {
		if (!open || active) return;
		const dismiss = (event: PointerEvent) => {
			const path = event.composedPath();
			if (panel.current && path.includes(panel.current)) return;
			if (addButton.current && path.includes(addButton.current)) return;
			setPanelScope(undefined);
		};
		document.addEventListener("pointerdown", dismiss, true);
		return () => document.removeEventListener("pointerdown", dismiss, true);
	}, [active, addButton, open]);

	function choose(mode: PickerMode, photoIds?: string[]) {
		if (active) return;
		if (!limit || (photoIds && photoIds.length > limit)) {
			setIssue({ scope, value: "tooManyFiles" });
			return;
		}
		if (mode === "recentPhotos" && !photoIds?.length) return;
		setIssue(undefined);
		setRequest({ scope, mode, limit, ...(photoIds?.length ? { photoIds } : {}) });
	}

	return {
		iphone,
		open,
		busy: open,
		picking: Boolean(active),
		importing,
		limit,
		panel,
		issue: issue?.scope === scope ? issue.value : undefined,
		close() {
			if (!active) setPanelScope(undefined);
		},
		choose,
		toggle() {
			if (active) return;
			setIssue(undefined);
			setPanelScope(open ? undefined : scope);
		},
	};
}

type PhotoRailState =
	| {
			access: IosPhotoAccess;
			photos: IosRecentPhoto[];
	  }
	| "loading"
	| "failed";

export function IosComposerAttachmentPanel({
	picker,
	onMeeting,
}: {
	picker: ReturnType<typeof useIosComposerAttachments>;
	onMeeting?: (() => void) | undefined;
}) {
	const { t } = useTranslation();
	const [library, setLibrary] = useState<PhotoRailState>("loading");
	const [permissionBusy, setPermissionBusy] = useState(false);
	const [selected, setSelected] = useState<string[]>([]);
	const rail = useRef<HTMLDivElement>(null);
	const revision = useRef(0);
	const permissionAction = useRef(false);
	const refresh = useCallback(async (action?: "request" | "manage" | "retry") => {
		if (permissionAction.current) return;
		const mine = ++revision.current;
		if (action) {
			permissionAction.current = true;
			setPermissionBusy(true);
		}
		try {
			if (action === "manage") await manageIphonePhotoAccess();
			const access = await getIphonePhotoAccess(action === "request");
			const photos = access === "full" || access === "limited" ? await listIphoneRecentPhotos() : [];
			if (revision.current !== mine) return;
			setLibrary({ access, photos });
			const permitted = new Set(photos.map((photo) => photo.id));
			setSelected((previous) => previous.filter((id) => permitted.has(id)));
		} catch {
			if (revision.current === mine) {
				setLibrary("failed");
				setSelected([]);
			}
		} finally {
			if (action) {
				permissionAction.current = false;
				if (revision.current === mine) setPermissionBusy(false);
			}
		}
	}, []);
	useEffect(() => {
		void refresh();
		const resume = () => {
			if (document.visibilityState === "visible") void refresh();
		};
		window.addEventListener("focus", resume);
		document.addEventListener("visibilitychange", resume);
		return () => {
			revision.current += 1;
			window.removeEventListener("focus", resume);
			document.removeEventListener("visibilitychange", resume);
		};
	}, [refresh]);

	const access = typeof library === "object" ? library.access : undefined;
	const photos = typeof library === "object" ? library.photos : [];
	const status =
		library === "loading" || permissionBusy
			? "composerAttachments.loadingPhotos"
			: library === "failed"
				? "composerAttachments.photosUnavailable"
				: access === "restricted"
					? "composerAttachments.photosRestricted"
					: access === "limited"
						? "composerAttachments.limitedPhotos"
						: access === "full"
							? "composerAttachments.noPhotos"
							: undefined;
	const action =
		library === "failed"
			? "retry"
			: access === "undetermined"
				? "request"
				: access === "denied" || access === "limited"
					? "manage"
					: undefined;
	const actionText =
		action === "retry"
			? "app.retry"
			: action === "request"
				? "composerAttachments.allowRecentPhotos"
				: access === "limited"
					? "composerAttachments.manageRecentPhotos"
					: "composerAttachments.openPhotoSettings";

	return (
		<fieldset
			ref={picker.panel}
			className="composer-ios-attachment-panel"
			aria-label={t("composerAttachments.recentPhotos")}
			hidden={picker.importing}
			onKeyDown={(event) => {
				if (event.key === "Escape") picker.close();
			}}
		>
			{photos.length ? (
				<div className="composer-ios-photo-rail" ref={rail}>
					{photos.map((photo, index) => {
						const order = selected.indexOf(photo.id) + 1;
						return (
							<RecentPhoto
								key={photo.id}
								id={photo.id}
								label={t("composerAttachments.selectPhoto", { number: index + 1 })}
								order={order}
								root={rail}
								disabled={picker.picking || (!order && selected.length >= picker.limit)}
								onSelect={() => setSelected(order ? selected.filter((id) => id !== photo.id) : [...selected, photo.id])}
							/>
						);
					})}
				</div>
			) : null}
			{!photos.length || access === "limited" ? (
				<div className="composer-ios-photo-state">
					{status ? <span role="status">{t(status)}</span> : null}
					{action ? (
						<button type="button" disabled={permissionBusy || picker.picking} onClick={() => void refresh(action)}>
							{t(actionText)}
						</button>
					) : null}
				</div>
			) : null}
			<div className="composer-ios-attachment-actions">
				<button type="button" disabled={picker.picking} onClick={() => picker.choose("documents")}>
					<FileText size={17} aria-hidden="true" />
					{t("composerAttachments.files")}
				</button>
				{onMeeting ? (
					<button
						type="button"
						aria-label={t("chatActions.recordMeeting")}
						title={t("chatActions.recordMeeting")}
						disabled={picker.picking}
						onClick={() => {
							picker.close();
							onMeeting();
						}}
					>
						<FileAudio size={17} aria-hidden="true" />
					</button>
				) : null}
				<div className="composer-ios-attachment-confirm">
					<button type="button" disabled={picker.picking} onClick={() => picker.choose("allPhotos")}>
						<Images size={17} aria-hidden="true" />
						{t("composerAttachments.allPhotos")}
						<ChevronRight size={14} aria-hidden="true" />
					</button>
					<button
						type="button"
						className="composer-ios-attachment-add"
						disabled={!selected.length || selected.length > picker.limit || picker.picking}
						onClick={() => picker.choose("recentPhotos", selected)}
					>
						{selected.length
							? t("composerAttachments.addPhotos", { count: selected.length })
							: t("composerAttachments.add")}
					</button>
				</div>
			</div>
		</fieldset>
	);
}

function RecentPhoto({
	id,
	label,
	order,
	root,
	disabled,
	onSelect,
}: {
	id: string;
	label: string;
	order: number;
	root: RefObject<HTMLDivElement | null>;
	disabled: boolean;
	onSelect: () => void;
}) {
	const button = useRef<HTMLButtonElement>(null);
	const [blob, setBlob] = useState<Blob>();
	const url = useObjectUrl(blob);
	useEffect(() => {
		let cancelled = false;
		const load = () => {
			void readIphonePhotoThumbnail(id).then(
				(value) => {
					if (!cancelled) setBlob(value);
				},
				() => {},
			);
		};
		let observer: IntersectionObserver | undefined;
		if (button.current && typeof IntersectionObserver !== "undefined") {
			observer = new IntersectionObserver(
				(entries) => {
					if (!entries.some((entry) => entry.isIntersecting)) return;
					observer?.disconnect();
					load();
				},
				{ root: root.current, rootMargin: "0px 96px" },
			);
			observer.observe(button.current);
		} else load();
		return () => {
			cancelled = true;
			observer?.disconnect();
		};
	}, [id, root]);

	return (
		<button
			ref={button}
			type="button"
			className="composer-ios-recent-photo"
			aria-label={label}
			aria-pressed={Boolean(order)}
			disabled={disabled}
			onClick={onSelect}
		>
			{url ? <img src={url} alt="" /> : <Image size={23} aria-hidden="true" />}
			<span className="composer-ios-photo-badge" aria-hidden="true">
				{order || null}
			</span>
		</button>
	);
}
