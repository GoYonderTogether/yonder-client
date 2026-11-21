import {
	MeetingRecorderCapsule,
	type MeetingRecorderController,
	type MeetingRecording,
	recordingDuration,
} from "@yonder/feature-meetings";
import type { Conversation } from "@yonder/protocol";
import { Camera, ChevronDown, Square } from "lucide-react";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	archiveMeetingPhoto,
	listMeetingPhotos,
	MEETING_PHOTO_LIMIT,
	type MeetingPhoto,
} from "../lib/meeting-photos.ts";
import { useObjectUrl } from "../lib/use-object-url.ts";
import { MeetingCamera } from "./meeting-camera.tsx";
import { MAIN_BOT_PATH } from "./use-phone-tabs.ts";
import "./meeting-recording-surface.css";

export interface LiveMeetingCaption {
	recordingId: string;
	conversationId: string;
	segmentIndex: number;
	startMs?: number;
	text: string;
	isFinal: boolean;
}
interface LiveMeetingView {
	caption: LiveMeetingCaption | null;
	transcript: string;
	offline: boolean;
	asrErrorCode?: string | null;
	syncFailed?: boolean;
	audioAccepted?: boolean;
}
type Session = {
	recorder: MeetingRecorderController;
	active?: MeetingRecording | undefined;
	interrupted?: MeetingRecording | undefined;
	live?: LiveMeetingView | undefined;
	start(target: Conversation): void;
};

function useOffline() {
	const [offline, setOffline] = useState(() => !navigator.onLine);
	useEffect(() => {
		const update = () => setOffline(!navigator.onLine);
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, []);
	return offline;
}

export function eligibleMeetingTarget(conversation: Conversation | undefined, owns: (id: string) => boolean) {
	return conversation?.kind === "direct" &&
		!conversation.visit &&
		conversation.members.some(({ memberId, kind }) => kind === "bot" && owns(memberId))
		? conversation
		: undefined;
}

export function openMeetingSource(
	current: string | undefined,
	target: string,
	primary: string | undefined,
	go: (path: string) => void,
) {
	if (current !== target) go(target === primary ? MAIN_BOT_PATH : `/messages/${encodeURIComponent(target)}`);
}

export function useMeetingRecordingSurface(
	ownerId: string | null,
	foregroundConversationId: string | undefined,
	{ active, interrupted, recorder, live, start }: Session,
	showSource: (target: Conversation) => void,
) {
	const id = active?.ownerId === ownerId ? active?.id : undefined;
	const source = active?.conversationId;
	const scope = id ? JSON.stringify([ownerId, id]) : undefined;
	const foreground = Boolean(id && source && source === foregroundConversationId);
	const isLive = Boolean(active && "transportMode" in active && active.transportMode === "live");
	const networkOffline = useOffline();
	const offline = isLive && (networkOffline || Boolean(live?.offline));
	const capsule = useRef<HTMLElement>(null);
	const seen = useRef<string | undefined>(undefined);
	const [expanded, setExpanded] = useState<string>();
	const [photoArchive, setPhotoArchive] = useState<{ id: string; photos: MeetingPhoto[]; error?: boolean }>();
	const caption = live?.caption;
	const latest = isLive && caption && caption.recordingId === id && caption.conversationId === source ? caption : null;
	const transcript = latest ? (live?.transcript ?? "") : "";
	const asrUnavailable = isLive && Boolean(live?.asrErrorCode || live?.syncFailed);
	function startNew(target: Conversation | undefined) {
		if (!ownerId || !target || active || interrupted || recorder.busy) return;
		showSource(target);
		start(target);
	}
	useEffect(() => {
		if (id === undefined) seen.current = undefined;
		if (!foreground) {
			setExpanded(undefined);
			return;
		}
		if (seen.current === scope) return;
		seen.current = scope;
		setExpanded(scope);
	}, [id, foreground, scope]);

	useEffect(() => {
		if (!ownerId || !id || !scope) return;
		let relevant = true;
		listMeetingPhotos(ownerId, id).then(
			(photos) => {
				if (relevant)
					setPhotoArchive((previous) => ({
						id: scope,
						photos: [
							...new Map(
								[...photos, ...(previous?.id === scope ? previous.photos : [])].map((photo) => [photo.id, photo]),
							).values(),
						],
					}));
			},
			() => {
				if (relevant) setPhotoArchive({ id: scope, photos: [], error: true });
			},
		);
		return () => {
			relevant = false;
		};
	}, [id, ownerId, scope]);

	if (!id || !scope || !active || !ownerId) {
		const recovery =
			!id &&
			interrupted &&
			interrupted.ownerId === ownerId &&
			foregroundConversationId &&
			interrupted.conversationId === foregroundConversationId ? (
				<MeetingRecovery recorder={recorder} recording={interrupted} />
			) : null;
		return { status: recovery, dialog: null, start: startNew };
	}
	const photos = photoArchive?.id === scope ? photoArchive.photos : [];
	const status = (
		<MeetingRecorderCapsule
			recorder={recorder}
			caption={foreground ? latest?.text : undefined}
			offline={foreground && offline}
			live={foreground && isLive}
			hiddenWhileExpanded={foreground && expanded === scope}
			onExpand={foreground ? () => setExpanded(scope) : undefined}
			capsuleRef={capsule}
		/>
	);
	const dialog =
		foreground && expanded === scope ? (
			<MeetingRecordingDialog
				key={id}
				active={active}
				busy={recorder.busy}
				audioLevel={recorder.state.audioLevel}
				isLive={isLive}
				capsule={capsule}
				transcript={transcript}
				photos={photos}
				photoArchiveError={photoArchive?.id === scope && photoArchive.error}
				asrUnavailable={asrUnavailable}
				audioAccepted={Boolean(live?.audioAccepted)}
				offline={offline}
				onCollapse={() => {
					setExpanded(undefined);
					requestAnimationFrame(() => capsule.current?.querySelector("button")?.focus({ preventScroll: true }));
				}}
				onStop={() => recorder.stop(id)}
				onPhoto={async (image, elapsedMs) => {
					const photo = await archiveMeetingPhoto(ownerId, id, elapsedMs, image);
					setPhotoArchive((previous) => ({
						id: scope,
						photos: [...(previous?.id === scope ? previous.photos : []), photo],
					}));
				}}
			/>
		) : null;
	return {
		status,
		dialog,
		start: (target: Conversation | undefined) => {
			if (foreground && target?.id === source) setExpanded(scope);
		},
	};
}

function MeetingRecovery({
	recorder,
	recording,
}: {
	recorder: MeetingRecorderController;
	recording: MeetingRecording;
}) {
	const { t } = useTranslation();
	return (
		<section className="meeting-recovery" aria-label={t("meetingRecorder.interrupted")}>
			<strong>
				{t("meetingRecorder.interrupted")} · {recordingDuration(recording.savedDurationMs)}
			</strong>
			<p>{t("meetingRecorder.recoverHelp")}</p>
			<div>
				{recorder.resume ? (
					<button
						type="button"
						className="meeting-recording-button"
						disabled={recorder.busy}
						onClick={() => void recorder.resume?.(recording.id)}
					>
						{t("meetingRecorder.resume")}
					</button>
				) : null}
				<button
					type="button"
					className="meeting-recording-button meeting-recording-stop"
					disabled={recorder.busy}
					onClick={() => void recorder.stop(recording.id)}
				>
					{t("meetingRecorder.stop")}
				</button>
			</div>
		</section>
	);
}

function animateDialog(dialog: HTMLDialogElement, capsule: HTMLElement | null, open: boolean) {
	if (!capsule || !dialog.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	const small = capsule.getBoundingClientRect();
	const large = dialog.getBoundingClientRect();
	if (!small.width || !large.width) return;
	const collapsed = `inset(${small.top - large.top}px ${large.right - small.right}px ${large.bottom - small.bottom}px ${small.left - large.left}px round ${small.height / 2}px)`;
	const full = "inset(0px 0px 0px 0px round 0px)";
	const frames = [
		{ clipPath: collapsed, opacity: 0.25 },
		{ clipPath: full, opacity: 1 },
	];
	return dialog.animate(open ? frames : frames.reverse(), {
		duration: open ? 360 : 280,
		easing: open ? "cubic-bezier(.21,.85,.24,1)" : "cubic-bezier(.42,0,.25,1)",
		fill: open ? "none" : "forwards",
	});
}

function MeetingRecordingDialog({
	active,
	busy,
	audioLevel,
	isLive,
	capsule,
	transcript,
	photos,
	photoArchiveError,
	asrUnavailable,
	audioAccepted,
	offline,
	onCollapse,
	onStop,
	onPhoto,
}: {
	active: MeetingRecording;
	busy: boolean;
	audioLevel?: number | undefined;
	isLive: boolean;
	capsule: RefObject<HTMLElement | null>;
	transcript: string;
	photos: MeetingPhoto[];
	photoArchiveError?: boolean | undefined;
	asrUnavailable: boolean;
	audioAccepted: boolean;
	offline: boolean;
	onCollapse: () => void;
	onStop: () => Promise<void>;
	onPhoto: (image: Promise<Blob>, elapsedMs: number) => Promise<void>;
}) {
	const { t } = useTranslation();
	const dialog = useRef<HTMLDialogElement>(null);
	const thread = useRef<HTMLDivElement>(null);
	const cameraButton = useRef<HTMLButtonElement>(null);
	const closeButton = useRef<HTMLButtonElement>(null);
	const followEnd = useRef(true);
	const closing = useRef(false);
	const [camera, setCamera] = useState(false);
	const [photoNotice, setPhotoNotice] = useState(false);
	const title = t(isLive ? "meetingRecorder.liveTitle" : "meetingRecorder.name");
	const cameraAvailable = !photoArchiveError;
	useLayoutEffect(() => {
		const node = dialog.current;
		if (!node) return;
		if (typeof node.showModal === "function") node.showModal();
		else node.setAttribute("open", "");
		closeButton.current?.focus({ preventScroll: true });
		const enter = animateDialog(node, capsule.current, true);
		return () => enter?.cancel();
	}, [capsule]);
	useLayoutEffect(() => {
		const node = thread.current;
		const content = node?.firstElementChild;
		if (!node || !content || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			if (followEnd.current) node.scrollTop = node.scrollHeight;
		});
		observer.observe(content);
		return () => observer.disconnect();
	}, []);

	function closeCamera() {
		setCamera(false);
		requestAnimationFrame(() => cameraButton.current?.focus({ preventScroll: true }));
	}
	function collapse() {
		if (closing.current) return;
		closing.current = true;
		const node = dialog.current;
		if (!node) return onCollapse();
		for (const animation of node.getAnimations?.() ?? []) animation.cancel();
		const leave = animateDialog(node, capsule.current, false);
		const done = () => {
			if (node.open && typeof node.close === "function") node.close();
			onCollapse();
		};
		if (leave) void leave.finished.then(done, done);
		else done();
	}

	return (
		<dialog
			ref={dialog}
			aria-label={title}
			className="meeting-recording-dialog"
			onCancel={(event) => {
				event.preventDefault();
				if (camera) closeCamera();
				else collapse();
			}}
		>
			<div className="meeting-recording-body" hidden={camera}>
				<header className="meeting-recording-header">
					<button ref={closeButton} type="button" className="meeting-recording-button" onClick={collapse}>
						<ChevronDown size={18} aria-hidden="true" />
						{t("meetingRecorder.collapse")}
					</button>
					<h2>{title}</h2>
					<span />
				</header>
				<div
					className="meeting-transcript"
					ref={thread}
					onScroll={(event) => {
						const node = event.currentTarget;
						followEnd.current = node.scrollHeight - node.clientHeight - node.scrollTop <= 48;
					}}
				>
					<div className="meeting-transcript-inner">
						<p className="meeting-transcript-eyebrow">
							<span className="meeting-recording-dot" aria-hidden="true" />
							{t("meetingRecorder.recording")}
						</p>
						{offline ? (
							<p className="meeting-recording-notice" role="status">
								{t("meetingRecorder.offlineLive")}
							</p>
						) : null}
						{!offline && asrUnavailable ? (
							<p className="meeting-recording-notice" role="status">
								{t("meetingRecorder.liveUnavailable")}
							</p>
						) : null}
						{photoArchiveError ? (
							<p className="meeting-recording-notice" role="status">
								{t("meetingRecorder.photoArchiveFailed")}
							</p>
						) : null}
						{photoNotice ? (
							<span className="sr-only" role="status">
								{t("meetingRecorder.photoSaved")}
							</span>
						) : null}
						{isLive && !transcript && !offline && !asrUnavailable ? (
							<p className="meeting-transcript-empty" role="status">
								{t(audioAccepted ? "meetingRecorder.waitingLive" : "meetingRecorder.waitingAudio")}
							</p>
						) : null}
						<div className="meeting-transcript-log" role="log" aria-live="off">
							<MeetingTimeline transcript={transcript} photos={photos} />
						</div>
					</div>
				</div>
				<footer className="meeting-recording-toolbar">
					{cameraAvailable ? (
						<button
							ref={cameraButton}
							type="button"
							className="meeting-recording-button"
							disabled={photos.length >= MEETING_PHOTO_LIMIT}
							onClick={() => {
								setPhotoNotice(false);
								setCamera(true);
							}}
						>
							<Camera size={19} aria-hidden="true" />
							{t("meetingRecorder.camera")}
						</button>
					) : (
						<span />
					)}
					<div className="meeting-recording-readout">
						<output aria-live="off" aria-label={t("meetingRecorder.elapsed")} className="meeting-recording-clock">
							{recordingDuration(active.durationMs)}
						</output>
						{audioLevel !== undefined ? (
							<>
								<meter
									className="sr-only"
									min={0}
									max={100}
									value={Math.round(audioLevel * 100)}
									aria-label={t("meetingRecorder.audioLevel")}
								/>
								<div className="meeting-level-bars" aria-hidden="true">
									{[0, 1, 2, 3, 4, 5].map((index) => (
										<span key={index} data-peak={index < Math.ceil(audioLevel * 6) || undefined} />
									))}
								</div>
							</>
						) : null}
					</div>
					<button
						type="button"
						className="meeting-recording-button meeting-recording-stop"
						disabled={busy}
						onClick={() => void onStop()}
					>
						<Square size={12} fill="currentColor" aria-hidden="true" />
						{t("meetingRecorder.stop")}
					</button>
				</footer>
			</div>
			{camera ? (
				<MeetingCamera
					elapsedMs={active.durationMs}
					onClose={closeCamera}
					onPhoto={async (image, elapsedMs) => {
						await onPhoto(image, elapsedMs);
						setPhotoNotice(true);
					}}
				/>
			) : null}
		</dialog>
	);
}

function MeetingTimeline({ transcript, photos }: { transcript: string; photos: MeetingPhoto[] }) {
	const { t } = useTranslation();
	return (
		<>
			{transcript ? (
				<div className="meeting-transcript-entry">
					<p>{transcript}</p>
				</div>
			) : null}
			{photos.length ? (
				<section className="meeting-timeline-photos" aria-label={t("meetingRecorder.photosOnDevice")}>
					{photos.map((photo) => (
						<Photo key={photo.id} photo={photo} />
					))}
				</section>
			) : null}
		</>
	);
}

function Photo({ photo }: { photo: MeetingPhoto }) {
	const { t } = useTranslation();
	const url = useObjectUrl(photo.image);
	const time = recordingDuration(photo.elapsedMs);
	return (
		<figure className="meeting-transcript-entry">
			<time>{time}</time>
			{url ? <img src={url} alt={t("meetingRecorder.cameraPhoto", { time })} /> : null}
		</figure>
	);
}
