import type { Attachment, SendMessageRequest } from "@yonder/protocol";
import {
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
	AttachmentTooLargeError,
	CHAT_ATTACHMENT_LIMIT,
	CHAT_ATTACHMENT_MAX_BYTES,
	canAttachFile,
	type Draft,
	type DraftFile,
	draftFile,
	emptyDraft,
	replaceFile,
	selectedDraftFile,
	sendErrorMessageKey,
	withPresetFor,
} from "./chat-draft-model.ts";
import {
	boundMemberIds,
	boundSkillIds,
	type CompletionMarker,
	reconcileBindings,
	type TextEditRange,
} from "./completion/bindings.ts";
import { completionHistory } from "./completion/history.ts";

export {
	AttachmentTooLargeError,
	CHAT_ATTACHMENT_LIMIT,
	CHAT_ATTACHMENT_MAX_BYTES,
	canAttachFile,
	type Draft,
	type DraftFile,
	draftFile,
	emptyDraft,
	replaceFile,
	selectedDraftFile,
	sendErrorMessageKey,
	withPresetFor,
} from "./chat-draft-model.ts";

export function useChatDraft(owner: string | undefined, conversation: string | undefined) {
	const api = useApi();
	const key = owner && conversation ? `draft:${owner}:${conversation}` : "";
	const liveKey = useRef(key);
	liveKey.current = key;
	const current = useRef({ key, value: emptyDraft(), loaded: false });
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
		const initial = { key, value: emptyDraft(), loaded: !key };
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
						: emptyDraft();
					current.current = { key, value: withPresetFor(key, loaded), loaded: true };
					setState(current.current);
					resumeImages(current.current.value.files, key);
				})
				.catch(() => {
					if (!active) return;
					current.current = { key, value: withPresetFor(key, emptyDraft()), loaded: true };
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
		const accepted = files.filter((file) => canAttachFile(file));
		const available = Math.max(0, CHAT_ATTACHMENT_LIMIT - current.current.value.files.length);
		if (accepted.length !== files.length) setError("chat.fileTooLarge");
		else if (accepted.length > available) setError("chat.tooManyFiles");
		else setError("");
		const additions = accepted.slice(0, available).map((file) => draftFile(file, voiceTranscript));
		change((draft) => ({
			...draft,
			revision: draft.revision + 1,
			files: [...draft.files, ...additions],
		}));
		for (const file of additions) if (isImageFile(file.name, file.mimeType)) void prepare(file, key);
	}

	function prepare(file: DraftFile, scope?: string): Promise<PreparedImage | undefined> {
		if (file.imagePrepared) return Promise.resolve(file.optimized);
		const existing = preparations.current.get(file.id);
		if (existing) return existing;
		const generation = chatCacheGeneration();
		const operation = imageQueue.current.then(async () => {
			if (generation !== chatCacheGeneration()) return;
			let optimized: PreparedImage | undefined;
			let failed = false;
			try {
				optimized = await prepareImage(file.blob, file.name, CHAT_ATTACHMENT_MAX_BYTES);
			} catch {
				failed = true;
			}
			if (generation !== chatCacheGeneration()) return;
			// A direct send has fixed bytes. Keep the same upload identity even if preparation ran again after restart.
			if (!scope) return optimized && { ...optimized, nonce: file.id };
			const apply = (draft = emptyDraft()): Draft => ({
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
		if (scope) preparations.current.set(file.id, operation);
		imageQueue.current = operation.then(
			() => {},
			() => {},
		);
		return operation;
	}

	/**
	 * Upload one draft file. `scope` names the draft whose strip shows the progress; a send that has
	 * already emptied the field passes `report` instead, so the progress lands on the copy it would
	 * restore rather than on the empty field.
	 */
	async function upload(
		file: DraftFile,
		scope: string | undefined,
		signal?: AbortSignal,
		report?: (update: (files: DraftFile[]) => DraftFile[]) => void,
	) {
		const cacheGeneration = chatCacheGeneration();
		const optimized =
			!file.sendOriginal && isImageFile(file.name, file.mimeType) ? await prepare(file, scope) : file.optimized;
		if (signal?.aborted) throw new DOMException("Attachment upload canceled", "AbortError");
		if (cacheGeneration !== chatCacheGeneration()) throw new Error("session_changed");
		const selected = selectedDraftFile({ ...file, optimized });
		const show = (patch: Partial<DraftFile>) => {
			const update = (files: DraftFile[]) => replaceFile(files, file.id, patch);
			if (report) report(update);
			else if (scope) change((draft) => ({ ...draft, files: update(draft.files) }), scope);
		};
		show({ status: "uploading" });
		try {
			if (selected.blob.size > CHAT_ATTACHMENT_MAX_BYTES) throw new AttachmentTooLargeError();
			const attachment = await api.uploadAttachment(
				new File([selected.blob], selected.name, { type: selected.mimeType }),
				selected.nonce,
				signal,
			);
			// The blob cache only speeds up a resend; a full or blocked store must not fail an upload the server took.
			if (owner && scope)
				void writeChatCache(attachmentCacheKey(owner, attachment.id), selected.blob, cacheGeneration).catch(() => {});
			if (cacheGeneration !== chatCacheGeneration()) return { attachment, blob: selected.blob };
			show({ status: "ready", uploaded: attachment });
			return { attachment, blob: selected.blob };
		} catch (error) {
			if (cacheGeneration !== chatCacheGeneration()) throw error;
			// A cancelled upload is not a failure: the file stays ready so the draft can be sent again.
			show({ status: signal?.aborted ? "ready" : "failed" });
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
		const sentIds = new Set(draft.files.map((file) => file.id));
		const sentBindings = new Set(
			(draft.bindings ?? []).filter((binding) => binding.kind === "skill").map((binding) => binding.key),
		);
		// What a failed send puts back: the text, the files, the bindings and the nonce this attempt used,
		// so a retry resends the same message rather than a second copy of it.
		const snapshot: Draft = { ...draft, clientNonce: nonce };
		// The bubble is already on screen: the send mutation inserts it optimistically. Empty the field in
		// the same turn, so the draft, the attachment strip and its bindings leave with the bubble instead
		// of waiting for the round trip. `clearedRevision` is what tells this submit's empty field apart
		// from one the person has started filling again before the answer arrives.
		const clearedRevision = draft.revision + 1;
		if (current.current.key === scope) {
			current.current = {
				key: scope,
				value: { text: "", files: [], bindings: [], revision: clearedRevision },
				loaded: true,
			};
			setState(current.current);
		}
		let sent = false;
		try {
			const attachments: Attachment[] = [];
			const transcripts: string[] = [];
			for (const file of draft.files) {
				if (interrupted()) return;
				let transcript = file.voiceTranscript;
				if (transcript === null) {
					const audio = new File([file.blob], file.name, { type: file.mimeType });
					const result = await api.transcribeAudio(audio, controller.signal);
					if (cacheGeneration !== chatCacheGeneration()) return;
					transcript = result.text.trim();
					// Keep the transcript on the message a retry would resend, so it is transcribed once.
					snapshot.files = replaceFile(snapshot.files, file.id, { voiceTranscript: transcript });
				}
				if (transcript) transcripts.push(transcript);
				if (interrupted()) return;
				// The field is already empty, so the upload reports its progress to the snapshot: the message
				// a retry resends carries the server's attachment, or the failure to show.
				const uploaded = (
					await upload(file, scope, controller.signal, (update) => {
						snapshot.files = update(snapshot.files);
					})
				).attachment;
				attachments.push(uploaded);
			}
			if (interrupted()) return;
			const recording = snapshot.files[0];
			const durationMs =
				snapshot.files.length === 1 && !draft.text.trim() && recording?.voiceTranscript !== undefined
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
			sent = true;
			// Storage keeps the sent draft until now, so a reload in the middle of a send still finds it.
			// What someone typed after pressing send keeps its own text, files and bindings; only the sent
			// revision is cleared.
			const clearSent = (value = emptyDraft()): Draft => ({
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
			for (const id of sentIds) preparations.current.delete(id);
			// The server holds the bytes now, so the resend copy in the blob cache is no longer needed.
			if (owner)
				for (const attachment of attachments)
					void removeChatCache(attachmentCacheKey(owner, attachment.id)).catch(() => {});
			return true;
		} catch (error) {
			// Cancelling keeps the draft silently; any other failure says it was preserved, and a refusal
			// the server named says its real reason instead of the generic sentence.
			if (current.current.key === scope && !controller.signal.aborted) setError(sendErrorMessageKey(error));
		} finally {
			// A send that failed or was cancelled puts the message back, but only into a field still holding
			// this submit's empty draft: a person who has started the next message keeps it, and the failed
			// bubble stays the copy that its retry resends.
			if (!sent) restoreDraft(scope, clearedRevision, snapshot, cacheGeneration);
			finishSend(controller);
		}
	}

	/**
	 * Put a failed or cancelled submit's message back. The field is rewritten only while it still holds
	 * this submit's empty draft, and the stored entry (still the sent one, because storage is cleared
	 * only after an answer) only while nobody has edited it, so a next message wins on both sides.
	 */
	function restoreDraft(scope: string, clearedRevision: number, snapshot: Draft, generation: number) {
		if (generation !== chatCacheGeneration()) return;
		const restored: Draft = { ...snapshot, revision: clearedRevision + 1 };
		if (current.current.key === scope && current.current.loaded) {
			const value = current.current.value;
			if (value.revision === clearedRevision && !value.text && !value.files.length && !value.bindings?.length) {
				current.current = { key: scope, value: restored, loaded: true };
				setState(current.current);
			}
		}
		void updateChatCache<Draft>(
			scope,
			(value) => (value?.revision === snapshot.revision ? restored : value),
			generation,
		).catch(() => {});
	}

	function cancelSend() {
		const controller = inFlightSend.current?.controller;
		if (controller && !controller.signal.aborted) controller.abort();
	}
	async function preserveBeforeReload(): Promise<boolean> {
		const snapshot = current.current;
		if (inFlightSend.current || snapshot.key !== liveKey.current || !snapshot.loaded) return false;
		if (!snapshot.key) return true;
		const generation = chatCacheGeneration();
		try {
			await writeChatCache(snapshot.key, snapshot.value, generation);
			return (
				current.current === snapshot &&
				liveKey.current === snapshot.key &&
				chatCacheGeneration() === generation &&
				!inFlightSend.current
			);
		} catch {
			return false;
		}
	}
	const value = state.key === key ? state.value : emptyDraft();
	return {
		...value,
		skillIds: boundSkillIds(value.text, value.bindings ?? []),
		loaded: state.key === key && state.loaded,
		preserveBeforeReload,
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
		uploadDirectFile: (file: DraftFile, signal: AbortSignal) => upload(file, undefined, signal),
		toggleOriginal: (id: string, sendOriginal: boolean) =>
			void change((draft) => ({
				...draft,
				revision: draft.revision + 1,
				files: draft.files.map((file) =>
					file.id === id && (!sendOriginal || file.blob.size <= CHAT_ATTACHMENT_MAX_BYTES)
						? { ...file, sendOriginal }
						: file,
				),
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
