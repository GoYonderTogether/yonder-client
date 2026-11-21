import type { Attachment, SendMessageRequest } from "@yonder/protocol";
import {
	ApiError,
	attachmentCacheKey,
	chatCacheGeneration,
	readChatCache,
	removeChatCache,
	updateChatCache,
	useApi,
	writeChatCache,
} from "@yonder/ui-data";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { pcm16WavDurationMs } from "../lib/browser-meeting-wav.ts";
import { isImageFile, type PreparedImage, prepareImage } from "../lib/prepare-image.ts";
import {
	boundMemberIds,
	boundSkillIds,
	type CompletionBinding,
	type CompletionMarker,
	reconcileBindings,
	type TextEditRange,
} from "./completion/bindings.ts";
import { completionHistory } from "./completion/history.ts";
import { type PresetDraft, takePreset, withPreset } from "./draft-preset.ts";

export interface DraftFile {
	id: string;
	name: string;
	mimeType: string;
	blob: Blob;
	status: "ready" | "preparing" | "uploading" | "failed";
	uploaded?: Attachment;
	optimized?: PreparedImage | undefined;
	imagePrepared?: boolean;
	imageError?: boolean;
	sendOriginal?: boolean;
	/** Null while a recorded message for a Bot still needs transcription. */
	voiceTranscript?: string | null;
}

/** A draft just loaded: a preset aimed at this chat applies now, if the draft is still empty. */
function withPresetFor(key: string, draft: Draft): Draft {
	const phrase = takePreset(key, draft as PresetDraft);
	return phrase ? (withPreset(draft as PresetDraft, phrase) as Draft) : draft;
}

export function selectedDraftFile(file: DraftFile) {
	if (file.optimized && !file.sendOriginal) return { ...file.optimized, original: false };
	return { blob: file.blob, name: file.name, mimeType: file.mimeType, nonce: file.id, original: true };
}

/**
 * The message key for a refused send. A visit refusal and a quota refusal are real answers from
 * the server, so they replace the generic "your draft is preserved" line; anything else, including
 * a network failure, keeps that line because the draft really is preserved.
 */
const SEND_REFUSAL_KEYS = new Set(["visit_limit", "visit_denied", "visit_cap"]);

/**
 * A dissolved group, or a chat the sender was removed from, refuses every send with one code: the
 * composer says exactly that, in the members wording, instead of the generic "draft preserved" line
 * (19 3.2). It is a real refusal from the server, never drawn as something the Bot said.
 */
const CONVERSATION_CLOSED_KEY = "members.errors.conversationClosed";

export function sendErrorMessageKey(error: unknown): string {
	if (!(error instanceof ApiError)) return "chat.sendPreserved";
	if (error.code === "conversation_closed") return CONVERSATION_CLOSED_KEY;
	return SEND_REFUSAL_KEYS.has(error.code) ? `errors.${error.code}` : "chat.sendPreserved";
}
interface Draft {
	text: string;
	files: DraftFile[];
	clientNonce?: string | undefined;
	revision: number;
	bindings?: CompletionBinding[];
}
const empty = (): Draft => ({ text: "", files: [], revision: 0 });
const MAX_BYTES = 20 * 1024 * 1024;

export function useChatDraft(owner: string | undefined, conversation: string | undefined) {
	const api = useApi();
	const key = owner && conversation ? `draft:${owner}:${conversation}` : "";
	const liveKey = useRef(key);
	liveKey.current = key;
	const current = useRef({ key, value: empty(), loaded: false });
	const [state, setState] = useState(current.current);
	const [error, setError] = useState("");
	const [sending, setSending] = useState(false);
	const inFlightSend = useRef<{ controller: AbortController; preparingVoiceKey: string | undefined } | null>(null);
	const finishSend = useCallback((controller: AbortController) => {
		if (inFlightSend.current?.controller !== controller) return;
		inFlightSend.current = null;
		setSending(false);
	}, []);
	const bindingHistory = useRef(completionHistory());
	const preparations = useRef(new Map<string, Promise<PreparedImage | undefined>>());
	// ponytail: serialize image encoding to bound canvas memory; parallelize only if it becomes a measured wait.
	const imageQueue = useRef<Promise<unknown>>(Promise.resolve());
	const resumeImages = useEffectEvent((files: DraftFile[], scope: string) => {
		for (const file of files)
			if (isImageFile(file.name, file.mimeType) && !file.imagePrepared) void prepare(file, scope);
	});

	useEffect(() => {
		let active = true;
		const initial = { key, value: empty(), loaded: !key };
		current.current = initial;
		preparations.current.clear();
		setState(initial);
		setError("");
		if (key)
			void readChatCache<Draft>(key)
				.then((saved) => {
					if (!active) return;
					const loaded = saved
						? {
								...saved,
								files: saved.files.map((file) => ({
									...file,
									status: file.status === "uploading" || file.status === "preparing" ? ("ready" as const) : file.status,
								})),
							}
						: empty();
					current.current = { key, value: withPresetFor(key, loaded), loaded: true };
					setState(current.current);
					resumeImages(current.current.value.files, key);
				})
				.catch(() => {
					if (!active) return;
					current.current = { key, value: withPresetFor(key, empty()), loaded: true };
					setState(current.current);
					setError("chat.cacheFailed");
				});
		return () => {
			active = false;
			const pending = inFlightSend.current;
			if (pending && pending.preparingVoiceKey === key) {
				pending.controller.abort();
				finishSend(pending.controller);
			}
		};
	}, [key, finishSend]);

	function change(update: (draft: Draft) => Draft, scope = key, inputType?: string) {
		if (!scope || current.current.key !== scope || !current.current.loaded) return;
		const before = current.current.value;
		let value = update(before);
		const restored = bindingHistory.current(scope, before, value, inputType);
		if (restored) value = { ...value, bindings: restored };
		// Persist each edited draft with the nonce it will send, including the attachment selection.
		if (value.revision !== before.revision)
			value = { ...value, clientNonce: value.text || value.files.length ? crypto.randomUUID() : undefined };
		current.current = { key: scope, value, loaded: true };
		setState(current.current);
		return writeChatCache(scope, value).catch(() => {
			if (current.current.key === scope) setError("chat.cacheFailed");
		});
	}

	function addFiles(files: File[], voiceTranscript?: string | null) {
		if (!current.current.loaded || current.current.key !== key) return;
		const accepted = files.filter((file) => file.size <= MAX_BYTES);
		const available = Math.max(0, 10 - current.current.value.files.length);
		if (accepted.length !== files.length) setError("chat.fileTooLarge");
		else if (accepted.length > available) setError("chat.tooManyFiles");
		else setError("");
		const additions: DraftFile[] = accepted.slice(0, available).map((file) => ({
			id: crypto.randomUUID(),
			name: file.name,
			mimeType: file.type,
			blob: file,
			status: isImageFile(file.name, file.type) ? "preparing" : "ready",
			...(voiceTranscript !== undefined ? { voiceTranscript } : {}),
		}));
		change((draft) => ({
			...draft,
			revision: draft.revision + 1,
			files: [...draft.files, ...additions],
		}));
		for (const file of additions) if (isImageFile(file.name, file.mimeType)) void prepare(file, key);
	}

	function prepare(file: DraftFile, scope: string): Promise<PreparedImage | undefined> {
		if (file.imagePrepared) return Promise.resolve(file.optimized);
		const existing = preparations.current.get(file.id);
		if (existing) return existing;
		const generation = chatCacheGeneration();
		const operation = imageQueue.current.then(async () => {
			if (generation !== chatCacheGeneration()) return;
			let optimized: PreparedImage | undefined;
			let failed = false;
			try {
				optimized = await prepareImage(file.blob, file.name);
			} catch {
				failed = true;
			}
			if (generation !== chatCacheGeneration()) return;
			const apply = (draft = empty()): Draft => ({
				...draft,
				files: draft.files.map((item) =>
					item.id === file.id
						? {
								...item,
								optimized,
								imagePrepared: true,
								imageError: failed,
								status: item.status === "preparing" ? "ready" : item.status,
							}
						: item,
				),
			});
			if (current.current.key === scope) change(apply, scope);
			else await updateChatCache<Draft>(scope, apply, generation).catch(() => {});
			return optimized;
		});
		preparations.current.set(file.id, operation);
		imageQueue.current = operation.then(
			() => {},
			() => {},
		);
		return operation;
	}

	async function upload(file: DraftFile, scope: string, signal?: AbortSignal) {
		const cacheGeneration = chatCacheGeneration();
		const optimized =
			!file.sendOriginal && isImageFile(file.name, file.mimeType) ? await prepare(file, scope) : file.optimized;
		if (cacheGeneration !== chatCacheGeneration()) throw new Error("session_changed");
		const selected = selectedDraftFile({ ...file, optimized });
		change(
			(draft) => ({
				...draft,
				files: draft.files.map((item) => (item.id === file.id ? { ...item, status: "uploading" } : item)),
			}),
			scope,
		);
		try {
			const attachment = await api.uploadAttachment(
				new File([selected.blob], selected.name, { type: selected.mimeType }),
				selected.nonce,
				signal,
			);
			// The blob cache only speeds up a resend; a full or blocked store must not fail an upload the server took.
			if (owner)
				void writeChatCache(attachmentCacheKey(owner, attachment.id), selected.blob, cacheGeneration).catch(() => {});
			if (cacheGeneration !== chatCacheGeneration()) return attachment;
			change(
				(draft) => ({
					...draft,
					files: draft.files.map((item) =>
						item.id === file.id ? { ...item, status: "ready", uploaded: attachment } : item,
					),
				}),
				scope,
			);
			return attachment;
		} catch (error) {
			if (cacheGeneration !== chatCacheGeneration()) throw error;
			// A cancelled upload is not a failure: the file stays ready so the draft can be sent again.
			change(
				(draft) => ({
					...draft,
					files: draft.files.map((item) =>
						item.id === file.id ? { ...item, status: signal?.aborted ? "ready" : "failed" } : item,
					),
				}),
				scope,
			);
			throw error;
		}
	}

	async function submit(
		send: (input: SendMessageRequest & { attachments: Attachment[] }) => Promise<unknown>,
		voice?: { file: File; transcribe: boolean },
	) {
		if (
			inFlightSend.current ||
			!key ||
			liveKey.current !== key ||
			!current.current.loaded ||
			current.current.key !== key
		)
			return;
		if (voice) {
			const { text, files } = current.current.value;
			addFiles([voice.file], voice.transcribe ? null : "");
			// A draft may have arrived while recording. Keep the audio without auto-sending that draft.
			if (text.trim() || files.length) return;
		}
		const draft = current.current.value;
		const skillIds = boundSkillIds(draft.text, draft.bindings ?? []);
		const mentionedMemberIds = boundMemberIds(draft.text, draft.bindings ?? []);
		if (!draft.text.trim() && !draft.files.length) return;
		const scope = key;
		const cacheGeneration = chatCacheGeneration();
		const nonce = draft.clientNonce ?? crypto.randomUUID();
		const controller = new AbortController();
		const hasVoice = draft.files.some((file) => file.voiceTranscript !== undefined);
		const interrupted = () =>
			cacheGeneration !== chatCacheGeneration() || controller.signal.aborted || (hasVoice && liveKey.current !== scope);
		const pending = { controller, preparingVoiceKey: hasVoice ? scope : undefined };
		inFlightSend.current = pending;
		setSending(true);
		setError("");
		try {
			// Old drafts and presets applied during load may still need their first nonce.
			if (!draft.clientNonce) await change((value) => ({ ...value, clientNonce: nonce }), scope);
			const attachments: Attachment[] = [];
			const transcripts: string[] = [];
			for (const file of draft.files) {
				if (interrupted()) return;
				let transcript = file.voiceTranscript;
				if (transcript === null) {
					const audio = new File([file.blob], file.name, { type: file.mimeType });
					const result = await api.transcribeAudio(audio, controller.signal);
					if (cacheGeneration !== chatCacheGeneration()) return;
					const recognized = result.text.trim();
					transcript = recognized;
					const saveTranscript = (value = empty()): Draft => ({
						...value,
						files: value.files.map((item) => (item.id === file.id ? { ...item, voiceTranscript: recognized } : item)),
					});
					if (current.current.key === scope) change(saveTranscript, scope);
					else await updateChatCache<Draft>(scope, saveTranscript, cacheGeneration);
				}
				if (transcript) transcripts.push(transcript);
				if (interrupted()) return;
				attachments.push(await upload(file, scope, controller.signal));
			}
			if (interrupted()) return;
			const recording = draft.files[0];
			const durationMs =
				draft.files.length === 1 && !draft.text.trim() && recording?.voiceTranscript !== undefined
					? pcm16WavDurationMs(recording.blob.size)
					: 0;
			pending.preparingVoiceKey = undefined;
			await send({
				type: "text",
				body: [draft.text.trim(), ...transcripts].filter(Boolean).join("\n"),
				clientNonce: nonce,
				attachmentIds: attachments.map((file) => file.id),
				attachments,
				...(durationMs > 0 && durationMs <= 120_000 && attachments[0]?.kind === "audio"
					? { voice: { durationMs } }
					: {}),
				...(skillIds?.length ? { skillIds } : {}),
				...(mentionedMemberIds.length ? { mentionedMemberIds } : {}),
			});
			const sentIds = new Set(draft.files.map((file) => file.id));
			const sentBindings = new Set(
				(draft.bindings ?? []).filter((binding) => binding.kind === "skill").map((binding) => binding.key),
			);
			for (const id of sentIds) preparations.current.delete(id);
			// The server holds the bytes now, so the resend copy in the blob cache is no longer needed.
			if (owner)
				for (const attachment of attachments)
					void removeChatCache(attachmentCacheKey(owner, attachment.id)).catch(() => {});
			const clearSent = (value = empty()): Draft => ({
				text: value.revision === draft.revision ? "" : value.text,
				files: value.files.filter((file) => !sentIds.has(file.id)),
				bindings:
					value.revision === draft.revision
						? []
						: (value.bindings ?? []).filter((binding) => !sentBindings.has(binding.key)),
				revision: value.revision + 1,
			});
			if (cacheGeneration !== chatCacheGeneration()) return;
			if (current.current.key === scope) change(clearSent, scope);
			else await updateChatCache<Draft>(scope, clearSent, cacheGeneration);
			return true;
		} catch (error) {
			// Cancelling keeps the draft silently; any other failure says it was preserved, and a refusal
			// the server named says its real reason instead of the generic sentence.
			if (current.current.key === scope && !controller.signal.aborted) setError(sendErrorMessageKey(error));
		} finally {
			finishSend(controller);
		}
	}

	function cancelSend() {
		const controller = inFlightSend.current?.controller;
		if (controller && !controller.signal.aborted) controller.abort();
	}

	const value = state.key === key ? state.value : empty();
	return {
		...value,
		skillIds: boundSkillIds(value.text, value.bindings ?? []),
		loaded: state.key === key && state.loaded,
		error,
		sending,
		setText: (text: string, edit?: TextEditRange) =>
			void change(
				(draft) => ({
					...draft,
					revision: draft.revision + 1,
					text,
					bindings: reconcileBindings(draft.text, text, draft.bindings ?? [], edit),
				}),
				key,
				edit?.inputType,
			),
		acceptCompletion: (text: string, marker: CompletionMarker, edit?: TextEditRange) =>
			void change((draft) => {
				const bindings = reconcileBindings(draft.text, text, draft.bindings ?? [], edit).filter(
					(binding) => binding.end <= marker.start || binding.start >= marker.end,
				);
				if (
					marker.kind === "skill" &&
					!boundSkillIds(text, bindings).includes(marker.id) &&
					boundSkillIds(text, bindings).length >= 5
				)
					return draft;
				return {
					...draft,
					text,
					bindings: [...bindings, { ...marker, key: crypto.randomUUID() }],
					revision: draft.revision + 1,
				};
			}),
		appendText: (text: string) =>
			void change((draft) => ({
				...draft,
				revision: draft.revision + 1,
				text: [draft.text, text].filter(Boolean).join("\n"),
			})),
		addFiles,
		toggleOriginal: (id: string, sendOriginal: boolean) =>
			void change((draft) => ({
				...draft,
				revision: draft.revision + 1,
				files: draft.files.map((file) => (file.id === id ? { ...file, sendOriginal } : file)),
			})),
		removeFile: (id: string) => {
			preparations.current.delete(id);
			const removed = current.current.value.files.find((file) => file.id === id);
			// Drop the cached bytes with the draft entry, or they stay in IndexedDB until sign-out.
			if (owner && removed?.uploaded)
				void removeChatCache(attachmentCacheKey(owner, removed.uploaded.id)).catch(() => {});
			change((draft) => ({
				...draft,
				revision: draft.revision + 1,
				files: draft.files.filter((file) => file.id !== id),
			}));
		},
		retryFile: (id: string) => {
			const file = current.current.value.files.find((item) => item.id === id);
			if (file) void upload(file, key).catch(() => setError("chat.uploadFailed"));
		},
		submit,
		cancelSend,
	};
}
