import { Button } from "@yonder/ui-components";
import { Camera, FileText, Images } from "lucide-react";
import { type RefObject, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type IosAttachmentIssue, isIphoneAttachmentHost, pickIphoneAttachments } from "../lib/ios-chat-attachments.ts";
import { IosComposerPhotoBrowser } from "./composer-ios-photo-browser.tsx";
import type { ComposerProps } from "./composer-props.ts";
import { RecordingNoteIcon } from "./recording-note-icon.tsx";

type PickerMode = "photos" | "camera" | "documents";
type PickerRequest = { scope: string; mode: PickerMode; photoIds?: string[]; limit: number; sendOriginal: boolean };

export function useIosComposerAttachments({
	scope,
	mobile,
	enabled,
	direct,
	limit,
	addButton,
	onFiles,
}: {
	scope: string;
	mobile: boolean;
	enabled: boolean;
	direct: boolean;
	limit: number;
	addButton: RefObject<HTMLDivElement | null>;
	onFiles: (files: File[], original: boolean) => void;
}) {
	const iphone = mobile && isIphoneAttachmentHost();
	const [panelScope, setPanelScope] = useState<string>();
	const [albumOpen, setAlbumOpen] = useState(false);
	const [request, setRequest] = useState<PickerRequest>();
	const [importedRequest, setImportedRequest] = useState<PickerRequest>();
	const [issue, setIssue] = useState<{ scope: string; value: IosAttachmentIssue }>();
	const panel = useRef<HTMLFieldSetElement>(null);
	const open = enabled && iphone && panelScope === scope;
	const active = open && request?.scope === scope ? request : undefined;
	const importing = Boolean(active && (active.mode === "photos" || active === importedRequest));
	if (panelScope !== undefined && !open) {
		setPanelScope(undefined);
		setAlbumOpen(false);
		setRequest(undefined);
		setImportedRequest(undefined);
	}
	const report = useEffectEvent((value: IosAttachmentIssue) => setIssue({ scope, value }));
	const receive = useEffectEvent((files: File[], original: boolean) => onFiles(files, original));

	useLayoutEffect(() => {
		if (!active) return;
		const controller = new AbortController();
		void pickIphoneAttachments({
			documents: active.mode === "documents",
			camera: active.mode === "camera",
			photoIds: active.photoIds,
			allowPhotoFit: direct && active.mode === "photos" && !active.sendOriginal,
			limit: active.limit,
			signal: controller.signal,
			onImport: () => setImportedRequest(active),
		}).then(
			(result) => {
				if (controller.signal.aborted) return;
				setRequest(undefined);
				setImportedRequest(undefined);
				if (result.files.length && (!direct || !result.issue)) {
					setPanelScope(undefined);
					receive(result.files, active.sendOriginal);
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
	}, [active, direct]);

	useLayoutEffect(() => {
		if (!open || active || albumOpen) return;
		const dismiss = (event: MouseEvent) => {
			const path = event.composedPath();
			if (panel.current && path.includes(panel.current)) return;
			if (addButton.current && path.includes(addButton.current)) return;
			setPanelScope(undefined);
		};
		document.addEventListener("click", dismiss, true);
		return () => document.removeEventListener("click", dismiss, true);
	}, [active, addButton, albumOpen, open]);

	function choose(mode: PickerMode, photoIds?: string[], sendOriginal = false) {
		if (active) return;
		if (!limit || (photoIds && photoIds.length > limit)) {
			setIssue({ scope, value: "tooManyFiles" });
			return;
		}
		if (mode === "photos" && !photoIds?.length) return;
		setIssue(undefined);
		setRequest({
			scope,
			mode,
			limit,
			sendOriginal: mode === "documents" || sendOriginal,
			...(photoIds?.length ? { photoIds } : {}),
		});
	}

	return {
		iphone,
		direct,
		open,
		albumOpen,
		showAlbum: () => {
			setIssue(undefined);
			setAlbumOpen(true);
		},
		busy: open,
		picking: Boolean(active),
		importing,
		limit,
		panel,
		issue: issue?.scope === scope ? issue.value : undefined,
		close() {
			if (!active) {
				setAlbumOpen(false);
				setPanelScope(undefined);
			}
		},
		choose,
		toggle() {
			if (active) return;
			setIssue(undefined);
			setAlbumOpen(false);
			setPanelScope(open ? undefined : scope);
		},
	};
}

export function IosComposerAttachmentPanel({
	picker,
	onMeeting,
}: {
	picker: ReturnType<typeof useIosComposerAttachments>;
	onMeeting?: (() => void) | undefined;
}) {
	const { t } = useTranslation();
	return (
		<>
			<fieldset
				ref={picker.panel}
				className="composer-mobile-attachment-grid"
				aria-label={t("chat.attach")}
				hidden={picker.importing || picker.albumOpen}
				onKeyDown={(event) => {
					if (event.key === "Escape") picker.close();
				}}
			>
				<div className="composer-attachment-icons">
					<button type="button" disabled={picker.picking} onClick={picker.showAlbum}>
						<Images size={24} aria-hidden="true" />
						{t("composerAttachments.album")}
					</button>
					<button type="button" disabled={picker.picking} onClick={() => picker.choose("camera")}>
						<Camera size={24} aria-hidden="true" />
						{t("composerAttachments.camera")}
					</button>
					<button type="button" disabled={picker.picking} onClick={() => picker.choose("documents")}>
						<FileText size={24} aria-hidden="true" />
						{t(picker.direct ? "composerAttachments.sendFile" : "composerAttachments.files")}
					</button>
					{onMeeting ? (
						<button
							type="button"
							disabled={picker.picking}
							onClick={() => {
								picker.close();
								onMeeting();
							}}
						>
							<RecordingNoteIcon size={24} aria-hidden="true" />
							{t("chatActions.recordMeeting")}
						</button>
					) : null}
				</div>
			</fieldset>
			{picker.albumOpen ? (
				<IosComposerPhotoBrowser
					direct={picker.direct}
					busy={picker.picking}
					limit={picker.limit}
					issue={picker.issue}
					onClose={picker.close}
					onSend={(ids, original) => picker.choose("photos", ids, original)}
				/>
			) : null}
		</>
	);
}

export function IosAttachmentSendStatus({
	pickedFiles,
	importing,
	disabled,
}: {
	pickedFiles: ComposerProps["pickedFiles"];
	importing: boolean;
	disabled: boolean;
}) {
	const { t } = useTranslation();
	if (importing || pickedFiles?.sending)
		return (
			<p role="status" className="text-caption text-[var(--color-text-secondary)]">
				{t(importing ? "composerAttachments.preparingAttachments" : "chat.sending")}
			</p>
		);
	if (!pickedFiles?.failed) return null;
	return (
		<div
			role="alert"
			className="flex flex-wrap items-center gap-[var(--spacing-2)] text-caption text-[var(--color-danger)]"
		>
			{t("composerAttachments.directUploadFailed")}
			<Button type="button" size="sm" variant="link" disabled={disabled} onClick={pickedFiles.retry}>
				{t("app.retry")}
			</Button>
			<Button type="button" size="sm" variant="link" onClick={pickedFiles.discard}>
				{t("composerAttachments.discardSend")}
			</Button>
		</div>
	);
}
