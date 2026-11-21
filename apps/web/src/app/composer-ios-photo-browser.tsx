import { Button } from "@yonder/ui-components";
import { Overlay } from "@yonder/ui-shell";
import { ChevronDown, ChevronLeft, ChevronRight, Image } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	getIphonePhotoAccess,
	type IosAttachmentIssue,
	type IosPhotoAccess,
	type IosPhotoAlbum,
	type IosRecentPhoto,
	listIphonePhotoAlbums,
	listIphonePhotos,
	manageIphonePhotoAccess,
	readIphonePhotoThumbnail,
} from "../lib/ios-chat-attachments.ts";
import { useObjectUrl } from "../lib/use-object-url.ts";
import "./composer-ios-photo.css";

const PAGE_SIZE = 36;

export function IosComposerPhotoBrowser({
	direct,
	busy,
	limit,
	issue,
	onClose,
	onSend,
}: {
	direct: boolean;
	busy: boolean;
	limit: number;
	issue: IosAttachmentIssue | undefined;
	onClose: () => void;
	onSend: (ids: string[], original: boolean) => void;
}) {
	const { t } = useTranslation();
	const [access, setAccess] = useState<IosPhotoAccess | "checking" | "failed">("checking");
	const [albums, setAlbums] = useState<IosPhotoAlbum[]>([]);
	const [albumId, setAlbumId] = useState<string | null>(null);
	const [showAlbums, setShowAlbums] = useState(false);
	const [refreshCount, setRefreshCount] = useState(0);
	const [permissionBusy, setPermissionBusy] = useState(false);
	const [photos, setPhotos] = useState<IosRecentPhoto[]>([]);
	const [nextOffset, setNextOffset] = useState(0);
	const [more, setMore] = useState(false);
	const [pageBusy, setPageBusy] = useState(false);
	const [pageFailed, setPageFailed] = useState(false);
	const [selected, setSelected] = useState<string[]>([]);
	const [original, setOriginal] = useState(false);
	const [preview, setPreview] = useState<number | null>(null);
	const accessEpoch = useRef(0);
	const pageEpoch = useRef(0);
	const permissionAction = useRef(false);
	const refreshQueued = useRef(false);
	const paging = useRef(false);
	const moreControl = useRef<HTMLDivElement>(null);
	const grid = useRef<HTMLDivElement>(null);

	const refresh = useCallback(async function recheck(action?: "request" | "manage" | "retry") {
		if (permissionAction.current) {
			refreshQueued.current = true;
			return;
		}
		const epoch = ++accessEpoch.current;
		if (action) {
			permissionAction.current = true;
			setPermissionBusy(true);
		}
		try {
			if (action === "manage") await manageIphonePhotoAccess();
			const permission = await getIphonePhotoAccess(action === "request");
			const permitted = permission === "full" || permission === "limited";
			const available = permitted ? await listIphonePhotoAlbums().catch(() => []) : [];
			if (epoch !== accessEpoch.current) return;
			setAccess(permission);
			setAlbums(available ?? []);
			setAlbumId((current) => (available?.some((album) => album.id === current) ? current : null));
			if (!permitted) setSelected([]);
			setRefreshCount((current) => current + 1);
		} catch {
			if (epoch === accessEpoch.current) setAccess("failed");
		} finally {
			if (action) {
				permissionAction.current = false;
				if (epoch === accessEpoch.current) {
					setPermissionBusy(false);
					if (refreshQueued.current) {
						refreshQueued.current = false;
						void recheck();
					}
				}
			}
		}
	}, []);

	useEffect(() => {
		void refresh();
		const resume = () => {
			if (document.visibilityState === "visible") void refresh();
		};
		window.addEventListener("focus", resume);
		window.addEventListener("yonder-ios-photo-library-change", resume);
		document.addEventListener("visibilitychange", resume);
		return () => {
			accessEpoch.current += 1;
			window.removeEventListener("focus", resume);
			window.removeEventListener("yonder-ios-photo-library-change", resume);
			document.removeEventListener("visibilitychange", resume);
		};
	}, [refresh]);

	const permitted = access === "full" || access === "limited";
	const loadPage = useCallback(async (id: string | null, offset: number) => {
		if (paging.current) return;
		const epoch = pageEpoch.current;
		paging.current = true;
		setPageBusy(true);
		setPageFailed(false);
		try {
			const page = await listIphonePhotos(id, offset, PAGE_SIZE);
			if (pageEpoch.current !== epoch) return;
			setPhotos((previous) => {
				if (!offset) return page.assets;
				const ids = new Set(previous.map((photo) => photo.id));
				return [...previous, ...page.assets.filter((photo) => !ids.has(photo.id))];
			});
			setNextOffset(offset + page.assets.length);
			setMore(page.more && page.assets.length > 0);
		} catch {
			if (pageEpoch.current === epoch) setPageFailed(true);
		} finally {
			if (pageEpoch.current === epoch) {
				paging.current = false;
				setPageBusy(false);
			}
		}
	}, []);
	useEffect(() => {
		setPhotos([]);
		setMore(false);
		setPageFailed(false);
		setPageBusy(false);
		if (permitted && refreshCount) void loadPage(albumId, 0);
		return () => {
			pageEpoch.current += 1;
			paging.current = false;
		};
	}, [albumId, loadPage, permitted, refreshCount]);

	useEffect(() => {
		const target = moreControl.current;
		if (!more || preview !== null || !target || pageBusy || pageFailed || typeof IntersectionObserver === "undefined")
			return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadPage(albumId, nextOffset);
			},
			{ root: target.closest("[data-overlay-body]"), rootMargin: "280px 0px" },
		);
		observer.observe(target);
		return () => observer.disconnect();
	}, [albumId, loadPage, pageBusy, pageFailed, more, nextOffset, preview]);

	function changeAlbum(id: string | null) {
		setAlbumId(id);
		setShowAlbums(false);
		const body = grid.current?.closest<HTMLElement>("[data-overlay-body]");
		if (body) body.scrollTop = 0;
	}

	const status =
		access === "checking" || permissionBusy || (pageBusy && !photos.length)
			? t("composerAttachments.loadingPhotos")
			: pageFailed || access === "failed"
				? t("composerAttachments.photosUnavailable")
				: access === "restricted"
					? t("composerAttachments.photosRestricted")
					: access === "limited"
						? t("composerAttachments.limitedPhotos")
						: access === "full" && !photos.length
							? t("composerAttachments.noPhotos")
							: undefined;
	const action =
		access === "failed"
			? { label: t("app.retry"), run: () => void refresh("retry") }
			: pageFailed
				? { label: t("app.retry"), run: () => void loadPage(albumId, photos.length ? nextOffset : 0) }
				: access === "undetermined"
					? { label: t("composerAttachments.allowRecentPhotos"), run: () => void refresh("request") }
					: access === "limited" || access === "denied"
						? {
								label: t(
									access === "limited"
										? "composerAttachments.manageRecentPhotos"
										: "composerAttachments.openPhotoSettings",
								),
								run: () => void refresh("manage"),
							}
						: undefined;
	const previewId = preview === null ? undefined : selected[preview];
	const errorKey =
		issue === "fileTooLarge" || issue === "tooManyFiles" ? `chat.${issue}` : issue && `composerAttachments.${issue}`;

	return (
		<Overlay
			open
			mode="mobile"
			title={t("composerAttachments.album")}
			mobileBackLabel={t("composerAttachments.albumBack")}
			onClose={() => {
				if (busy) return;
				if (preview !== null) setPreview(null);
				else onClose();
			}}
			footer={
				<div className="composer-ios-album-footer">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						disabled={busy || !selected.length}
						onClick={() => setPreview(preview === null ? 0 : null)}
					>
						{t(preview === null ? "composerAttachments.previewSelected" : "composerAttachments.backToPhotos")}
					</Button>
					{direct ? (
						<label className="composer-ios-photo-original">
							<input
								type="checkbox"
								checked={original}
								disabled={busy}
								onChange={(event) => setOriginal(event.target.checked)}
							/>
							{t("composerAttachments.sendOriginal")}
						</label>
					) : null}
					<Button
						type="button"
						size="sm"
						variant="primary"
						disabled={busy || !selected.length || selected.length > limit}
						loading={busy}
						onClick={() => onSend(selected, original)}
					>
						{t(
							direct
								? selected.length
									? "composerAttachments.sendPhotosCount"
									: "composerAttachments.sendPhotos"
								: selected.length
									? "composerAttachments.addPhotos"
									: "composerAttachments.add",
							{ count: selected.length },
						)}
					</Button>
				</div>
			}
		>
			{previewId && preview !== null ? (
				<div className="composer-ios-album-preview">
					<PhotoPreview id={previewId} />
					<div className="composer-ios-preview-controls">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							aria-label={t("composerAttachments.previousPhoto")}
							disabled={preview === 0}
							onClick={() => setPreview(preview - 1)}
						>
							<ChevronLeft size={20} aria-hidden="true" />
						</Button>
						<span>
							{preview + 1} / {selected.length}
						</span>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							aria-label={t("composerAttachments.nextPhoto")}
							disabled={preview >= selected.length - 1}
							onClick={() => setPreview(preview + 1)}
						>
							<ChevronRight size={20} aria-hidden="true" />
						</Button>
					</div>
				</div>
			) : (
				<div ref={grid} className="composer-ios-album-content">
					{errorKey ? (
						<p role="alert" className="text-caption text-[var(--color-danger)]">
							{t(errorKey)}
						</p>
					) : null}
					{permitted ? (
						<Button
							type="button"
							size="sm"
							variant="ghost"
							aria-expanded={albums.length > 0 ? showAlbums : undefined}
							disabled={!albums.length || busy}
							onClick={() => setShowAlbums((open) => !open)}
						>
							{albums.find((album) => album.id === albumId)?.title ?? t("composerAttachments.recentPhotos")}
							{albums.length ? <ChevronDown size={16} aria-hidden="true" /> : null}
						</Button>
					) : null}
					{showAlbums ? (
						<div className="composer-ios-album-list">
							<Button type="button" size="sm" variant="ghost" aria-pressed={!albumId} onClick={() => changeAlbum(null)}>
								{t("composerAttachments.recentPhotos")}
							</Button>
							{albums.map(({ id, title }) => (
								<Button
									type="button"
									key={id}
									size="sm"
									variant="ghost"
									aria-pressed={albumId === id}
									onClick={() => changeAlbum(id)}
								>
									{title}
								</Button>
							))}
						</div>
					) : null}
					{status || action ? (
						<div className="composer-ios-photo-state">
							{status ? <span role="status">{status}</span> : null}
							{action ? (
								<Button type="button" size="sm" variant="link" disabled={permissionBusy || busy} onClick={action.run}>
									{action.label}
								</Button>
							) : null}
						</div>
					) : null}
					<div className="composer-ios-album-photos">
						{photos.map((photo, index) => {
							const order = selected.indexOf(photo.id) + 1;
							return (
								<PhotoTile
									key={photo.id}
									id={photo.id}
									label={t("composerAttachments.selectPhoto", { number: index + 1 })}
									order={order}
									disabled={busy || (!order && selected.length >= limit)}
									onSelect={() =>
										setSelected((items) =>
											items.includes(photo.id)
												? items.filter((id) => id !== photo.id)
												: items.length < limit
													? [...items, photo.id]
													: items,
										)
									}
								/>
							);
						})}
					</div>
					{more && !pageFailed ? (
						<div ref={moreControl}>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={pageBusy || busy}
								onClick={() => void loadPage(albumId, nextOffset)}
							>
								{t("composerAttachments.morePhotos")}
							</Button>
						</div>
					) : null}
				</div>
			)}
		</Overlay>
	);
}

function PhotoTile({
	id,
	label,
	order,
	disabled,
	onSelect,
}: {
	id: string;
	label: string;
	order: number;
	disabled: boolean;
	onSelect: () => void;
}) {
	const button = useRef<HTMLButtonElement>(null);
	const [blob, setBlob] = useState<Blob>();
	const url = useObjectUrl(blob);
	useEffect(() => {
		let revision = 0;
		const load = (visible: boolean) => {
			const current = ++revision;
			if (!visible) {
				setBlob(undefined);
				return;
			}
			void readIphonePhotoThumbnail(id).then(
				(file) => {
					if (current === revision) setBlob(file);
				},
				() => {},
			);
		};
		const target = button.current;
		let observer: IntersectionObserver | undefined;
		if (target && typeof IntersectionObserver !== "undefined") {
			observer = new IntersectionObserver((entries) => load(entries.some((entry) => entry.isIntersecting)), {
				root: target.closest("[data-overlay-body]"),
				rootMargin: "0px",
			});
			observer.observe(target);
		} else load(true);
		return () => {
			revision += 1;
			observer?.disconnect();
		};
	}, [id]);

	return (
		<button
			ref={button}
			type="button"
			className="composer-ios-album-photo"
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

function PhotoPreview({ id }: { id: string }) {
	const { t } = useTranslation();
	const [display, setDisplay] = useState<{ id: string; blob?: Blob | undefined }>();
	const url = useObjectUrl(display?.id === id ? display.blob : undefined);
	useEffect(() => {
		let active = true;
		void readIphonePhotoThumbnail(id, true).then(
			(blob) => {
				if (active) setDisplay({ id, blob });
			},
			() => {
				if (active) setDisplay({ id });
			},
		);
		return () => {
			active = false;
		};
	}, [id]);
	return url ? (
		<img className="composer-ios-photo-preview" src={url} alt={t("composerAttachments.previewSelected")} />
	) : (
		<span role="status">
			{t(
				display?.id === id && !display.blob
					? "composerAttachments.photosUnavailable"
					: "composerAttachments.loadingPhotos",
			)}
		</span>
	);
}
