// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useChatDraft } from "./use-chat-draft.ts";

const local = vi.hoisted(() => ({
	values: new Map<string, unknown>(),
	generation: 0,
	upload: vi.fn(),
	transcribe: vi.fn(),
	prepare: vi.fn(),
	failWrite: vi.fn((_key: string) => false),
}));
vi.mock("../lib/prepare-image.ts", () => ({
	isImageFile: (_name: string, mime: string) => mime.startsWith("image/"),
	prepareImage: local.prepare,
}));
vi.mock("@yonder/ui-data", async () => ({
	// The real error class, so a refusal the hook recognises is the same one the API client throws.
	ApiError: (await import("@yonder/api-client")).ApiError,
	useApi: () => ({ uploadAttachment: local.upload, transcribeAudio: local.transcribe }),
	attachmentCacheKey: (owner: string, id: string) => `blob:${owner}:${id}`,
	chatCacheGeneration: () => local.generation,
	readChatCache: async (key: string) => local.values.get(key),
	writeChatCache: async (key: string, value: unknown, generation = local.generation) => {
		if (local.failWrite(key)) throw new Error("quota_exceeded");
		if (generation === local.generation) local.values.set(key, value);
	},
	updateChatCache: async (key: string, update: (value: unknown) => unknown, generation: number) => {
		if (generation === local.generation) local.values.set(key, update(local.values.get(key)));
	},
	removeChatCache: async (key: string) => {
		local.values.delete(key);
	},
}));
beforeEach(() => {
	local.values.clear();
	local.generation = 0;
	local.failWrite.mockReset().mockReturnValue(false);
	local.prepare.mockReset().mockResolvedValue(undefined);
	local.transcribe.mockReset();
	local.upload
		.mockReset()
		.mockResolvedValue({ id: "att_uploaded", kind: "file", name: "notes.txt", mimeType: "text/plain", size: 4 });
});

test("keeps Bot recordings on failure or a chat switch and reuses the transcript and nonce", async () => {
	const { result, rerender } = renderHook(({ id }) => useChatDraft("alice", id), { initialProps: { id: "bot" } });
	await waitFor(() => expect(result.current.loaded).toBe(true));
	const file = new File([new Uint8Array(32_044)], "voice.wav", { type: "audio/wav" });
	local.transcribe.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ text: "听见了" });
	local.upload.mockResolvedValue({ id: "voice", kind: "audio", name: file.name, mimeType: file.type, size: file.size });
	const send = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue({});
	await act(() => result.current.submit(send, { file, transcribe: true }));
	expect(send).not.toHaveBeenCalled();
	expect(result.current.files[0]).toMatchObject({ blob: file, voiceTranscript: null });
	await act(() => result.current.submit(send));
	expect(send.mock.calls).toMatchObject([[{ body: "听见了", attachmentIds: ["voice"], voice: { durationMs: 1000 } }]]);
	await act(() => result.current.submit(send));
	expect(send.mock.calls[1]?.[0]).toEqual(send.mock.calls[0]?.[0]);
	expect(local.transcribe).toHaveBeenCalledTimes(2);
	expect(result.current.files).toEqual([]);
	local.transcribe.mockImplementationOnce(
		(_file, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener("abort", reject)),
	);
	act(() => void result.current.submit(send, { file, transcribe: true }));
	await waitFor(() => expect(local.transcribe).toHaveBeenCalledTimes(3));
	rerender({ id: "other" });
	await waitFor(() => expect(result.current.loaded).toBe(true));
	expect(result.current.sending).toBe(false);
	expect(local.transcribe.mock.calls[2]?.[1].aborted).toBe(true);
	expect(local.values.get("draft:alice:bot")).toMatchObject({ files: [{ blob: file }] });
});

test("only confirmed skill markers bind IDs; deleting a marker clears it and member IDs stay local", async () => {
	const result = renderHook(() => useChatDraft("alice", "completion"));
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() => result.result.current.setText("/pdf "));
	expect(result.result.current.skillIds).toEqual([]);
	act(() =>
		result.result.current.acceptCompletion("/pdf ", { id: "s", kind: "skill", marker: "/pdf", start: 0, end: 4 }),
	);
	expect(result.result.current.skillIds).toEqual(["s"]);
	act(() => result.result.current.setText("/pd "));
	act(() => result.result.current.setText("/pdf "));
	expect(result.result.current.skillIds).toEqual([]);
	act(() =>
		result.result.current.acceptCompletion("@Alex Doe ", {
			id: "m",
			kind: "member",
			marker: "@Alex Doe",
			start: 0,
			end: 9,
		}),
	);
	expect(result.result.current.bindings?.[0]).toMatchObject({ id: "m", kind: "member" });
	const send = vi.fn().mockResolvedValue({});
	await act(() => result.result.current.submit(send));
	expect(send).toHaveBeenCalledWith(expect.objectContaining({ body: "@Alex Doe" }));
	expect(send.mock.calls[0]?.[0]).not.toHaveProperty("skillIds");
	expect(send.mock.calls[0]?.[0]).not.toHaveProperty("mentions");
});

test("confirmation survives failed retries, respects five IDs, and is scoped to the conversation", async () => {
	const result = renderHook(({ conversation }) => useChatDraft("alice", conversation), {
		initialProps: { conversation: "a" },
	});
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	for (let i = 0; i < 6; i++) {
		const before = result.result.current.text;
		const marker = `/skill-${i}`;
		act(() =>
			result.result.current.acceptCompletion(`${before}${marker} `, {
				id: `s${i}`,
				kind: "skill",
				marker,
				start: before.length,
				end: before.length + marker.length,
			}),
		);
	}
	expect(result.result.current.skillIds).toEqual(["s0", "s1", "s2", "s3", "s4"]);
	expect(result.result.current.text).not.toContain("/skill-5");
	const send = vi.fn().mockRejectedValue(new Error("network"));
	await act(() => result.result.current.submit(send));
	const payload = send.mock.calls[0]?.[0];
	await act(() => result.result.current.submit(send));
	expect(send.mock.calls[1]?.[0]).toEqual(payload);
	result.rerender({ conversation: "b" });
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	expect(result.result.current.skillIds).toEqual([]);
});

test("a successful send removes sent bindings but preserves confirmations added during that send", async () => {
	const result = renderHook(() => useChatDraft("alice", "active"));
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() =>
		result.result.current.acceptCompletion("/pdf ", { id: "s1", kind: "skill", marker: "/pdf", start: 0, end: 4 }),
	);
	let finish!: () => void;
	const send = vi.fn(
		(_input: unknown) =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	let pending!: Promise<boolean | undefined>;
	act(() => {
		pending = result.result.current.submit(send);
	});
	await waitFor(() => expect(send).toHaveBeenCalledOnce());
	act(() =>
		result.result.current.acceptCompletion("/pdf /notes ", {
			id: "s2",
			kind: "skill",
			marker: "/notes",
			start: 5,
			end: 11,
		}),
	);
	await act(async () => {
		finish();
		await pending;
	});
	expect(send.mock.calls[0]?.[0]).toMatchObject({ skillIds: ["s1"] });
	expect(result.result.current.skillIds).toEqual(["s2"]);
	expect(result.result.current.text).toContain("/notes");
});

test("optimized and original byte choices survive restore and keep separate stable upload nonces", async () => {
	const original = new File([new Uint8Array([1, 2, 3, 4])], "photo.jpg", { type: "image/jpeg" });
	local.prepare.mockResolvedValue({
		blob: new Blob([new Uint8Array([5, 6])], { type: "image/jpeg" }),
		name: "photo.jpg",
		mimeType: "image/jpeg",
		width: 2,
		height: 1,
		nonce: "optimized-version",
	});
	const first = renderHook(() => useChatDraft("alice", "main"));
	await waitFor(() => expect(first.result.current.loaded).toBe(true));
	act(() => first.result.current.addFiles([original]));
	await waitFor(() => expect(first.result.current.files[0]?.imagePrepared).toBe(true));
	const send = vi.fn().mockRejectedValue(new Error("network unavailable"));
	await act(() => first.result.current.submit(send));
	expect(local.upload.mock.calls[0]?.[0].size).toBe(2);
	expect(local.upload.mock.calls[0]?.[1]).toBe("optimized-version");
	const id = first.result.current.files[0]?.id ?? "";
	act(() => first.result.current.toggleOriginal(id, true));
	first.unmount();
	const restored = renderHook(() => useChatDraft("alice", "main"));
	await waitFor(() => expect(restored.result.current.loaded).toBe(true));
	expect(restored.result.current.files[0]?.sendOriginal).toBe(true);
	expect(restored.result.current.files[0]?.blob.size).toBe(4);
	await act(() => restored.result.current.submit(send));
	expect(local.upload.mock.calls[1]?.[0].size).toBe(4);
	expect(local.upload.mock.calls[1]?.[1]).toBe(id);
	act(() => restored.result.current.toggleOriginal(id, false));
	await act(() => restored.result.current.submit(send));
	expect(local.upload.mock.calls[2]?.[0].size).toBe(2);
	expect(local.upload.mock.calls[2]?.[1]).toBe("optimized-version");
	expect(local.prepare).toHaveBeenCalledOnce();
});

test("draft text and attachment bytes restore per account and conversation", async () => {
	const first = renderHook(() => useChatDraft("alice", "main"));
	await waitFor(() => expect(first.result.current.loaded).toBe(true));
	act(() => {
		first.result.current.setText("unfinished prompt");
		first.result.current.addFiles([new File(["text"], "notes.txt", { type: "text/plain" })]);
	});
	first.unmount();
	const restored = renderHook(() => useChatDraft("alice", "main"));
	await waitFor(() => expect(restored.result.current.loaded).toBe(true));
	expect(restored.result.current.text).toBe("unfinished prompt");
	expect(restored.result.current.files[0]?.blob.size).toBe(4);
	expect(local.upload).not.toHaveBeenCalled();
	const other = renderHook(() => useChatDraft("bob", "main"));
	await waitFor(() => expect(other.result.current.loaded).toBe(true));
	expect(other.result.current.text).toBe("");
	expect(other.result.current.files).toEqual([]);
});

test("a late send confirmation clears only its files and preserves later typing", async () => {
	const result = renderHook(() => useChatDraft("alice", "main"));
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() => {
		result.result.current.setText("first");
		result.result.current.addFiles([new File(["text"], "notes.txt")]);
	});
	let resolve!: () => void;
	const send = vi.fn(
		(_input: unknown) =>
			new Promise<void>((done) => {
				resolve = done;
			}),
	);
	let pending!: Promise<unknown>;
	act(() => {
		pending = result.result.current.submit(send);
	});
	await waitFor(() => expect(send).toHaveBeenCalledOnce());
	act(() => result.result.current.setText("new prompt"));
	await act(async () => {
		resolve();
		await pending;
	});
	expect(result.result.current.text).toBe("new prompt");
	expect(result.result.current.files).toEqual([]);
});

test("confirmation while another conversation is open clears the original persisted draft", async () => {
	const result = renderHook(({ conversation }) => useChatDraft("alice", conversation), {
		initialProps: { conversation: "a" },
	});
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() => result.result.current.setText("message for A"));
	let resolve!: () => void;
	const send = vi.fn(
		(_input: unknown) =>
			new Promise<void>((done) => {
				resolve = done;
			}),
	);
	let pending!: Promise<unknown>;
	act(() => {
		pending = result.result.current.submit(send);
	});
	await waitFor(() => expect(send).toHaveBeenCalledOnce());
	result.rerender({ conversation: "b" });
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() => result.result.current.setText("unfinished B"));
	await act(async () => {
		resolve();
		await pending;
	});
	expect(result.result.current.text).toBe("unfinished B");
	result.rerender({ conversation: "a" });
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	expect(result.result.current.text).toBe("");
});

test("a response after account cleanup cannot restore old files or send under the next account", async () => {
	const result = renderHook(() => useChatDraft("alice", "main"));
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() => result.result.current.addFiles([new File(["text"], "notes.txt")]));
	let resolve!: (value: unknown) => void;
	local.upload.mockImplementation(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	const send = vi.fn();
	let pending!: Promise<unknown>;
	act(() => {
		pending = result.result.current.submit(send);
	});
	await waitFor(() => expect(local.upload).toHaveBeenCalledOnce());
	local.values.clear();
	local.generation++;
	await act(async () => {
		resolve({ id: "att_old", kind: "file", name: "notes.txt", mimeType: "text/plain", size: 4 });
		await pending;
	});
	expect(send).not.toHaveBeenCalled();
	expect(local.values.has("blob:alice:att_old")).toBe(false);
});

test.each(["skill", "member"] as const)("same-name %s IDs survive only at the actual edited side", async (kind) => {
	const marker = kind === "skill" ? "/same" : "@Same Name";
	const span = marker.length + 1;
	for (const removeFirst of [true, false]) {
		const hook = renderHook(() => useChatDraft("alice", `${kind}-${removeFirst}`));
		await waitFor(() => expect(hook.result.current.loaded).toBe(true));
		act(() =>
			hook.result.current.acceptCompletion(
				`${marker} `,
				{ id: "a", kind, marker, start: 0, end: marker.length },
				{ start: 0, end: 0 },
			),
		);
		act(() =>
			hook.result.current.acceptCompletion(
				`${marker} ${marker} `,
				{ id: "b", kind, marker, start: span, end: span + marker.length },
				{ start: span, end: span },
			),
		);
		expect(hook.result.current.bindings?.map((entry) => entry.id)).toEqual(["a", "b"]);
		act(() =>
			hook.result.current.setText(`${marker} `, removeFirst ? { start: 0, end: span } : { start: span, end: span * 2 }),
		);
		expect(hook.result.current.bindings?.map((entry) => entry.id)).toEqual([removeFirst ? "b" : "a"]);
		hook.unmount();
	}
});

test("native undo and redo restore the identities of same-name confirmations and deleted markers", async () => {
	const hook = renderHook(() => useChatDraft("alice", "undo"));
	await waitFor(() => expect(hook.result.current.loaded).toBe(true));
	act(() => hook.result.current.setText("/same"));
	act(() =>
		hook.result.current.acceptCompletion("/same ", {
			id: "a",
			kind: "skill",
			marker: "/same",
			start: 0,
			end: 5,
		}),
	);
	act(() => hook.result.current.setText("/same /same", { start: 6, end: 6 }));
	act(() =>
		hook.result.current.acceptCompletion(
			"/same /same ",
			{ id: "b", kind: "skill", marker: "/same", start: 6, end: 11 },
			{ start: 6, end: 11 },
		),
	);
	act(() => hook.result.current.setText("/same ", { start: 0, end: 6 }));
	expect(hook.result.current.skillIds).toEqual(["b"]);
	act(() => hook.result.current.setText("/same /same ", { start: 0, end: 6, inputType: "historyUndo" }));
	expect(hook.result.current.skillIds).toEqual(["a", "b"]);
	act(() => hook.result.current.setText("/same ", { start: 0, end: 12, inputType: "historyRedo" }));
	expect(hook.result.current.skillIds).toEqual(["b"]);
	act(() => hook.result.current.setText("/same /same ", { start: 0, end: 6, inputType: "historyUndo" }));
	act(() => hook.result.current.setText("/same /same", { start: 0, end: 12, inputType: "historyUndo" }));
	expect(hook.result.current.skillIds).toEqual(["a"]);
	act(() => hook.result.current.setText("/same /same ", { start: 0, end: 11, inputType: "historyRedo" }));
	expect(hook.result.current.skillIds).toEqual(["a", "b"]);
});

test("a failed cache write neither blocks the send nor marks a successful upload failed", async () => {
	local.failWrite.mockReturnValue(true);
	const result = renderHook(() => useChatDraft("alice", "quota"));
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() => {
		result.result.current.setText("still sends");
		result.result.current.addFiles([new File(["text"], "notes.txt", { type: "text/plain" })]);
	});
	const send = vi.fn().mockResolvedValue({});
	await act(() => result.result.current.submit(send));
	expect(send).toHaveBeenCalledOnce();
	expect(send.mock.calls[0]?.[0]).toMatchObject({ body: "still sends", attachmentIds: ["att_uploaded"] });
	expect(local.upload).toHaveBeenCalledOnce();
	expect(result.result.current.files).toEqual([]);
});

test("an upload whose cache write fails stays ready instead of turning into a failed file", async () => {
	const result = renderHook(() => useChatDraft("alice", "blob-quota"));
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() => result.result.current.addFiles([new File(["text"], "notes.txt", { type: "text/plain" })]));
	local.failWrite.mockImplementation((key) => key.startsWith("blob:"));
	const send = vi.fn().mockRejectedValue(new Error("network"));
	await act(() => result.result.current.submit(send));
	expect(local.upload).toHaveBeenCalledOnce();
	expect(result.result.current.files[0]?.status).toBe("ready");
	expect(result.result.current.files[0]?.uploaded).toMatchObject({ id: "att_uploaded" });
});

test("removing a file from the draft and sending both delete the cached attachment blob", async () => {
	const result = renderHook(() => useChatDraft("alice", "blob-lifecycle"));
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() =>
		result.result.current.addFiles([
			new File(["one"], "one.txt", { type: "text/plain" }),
			new File(["two"], "two.txt", { type: "text/plain" }),
		]),
	);
	local.upload.mockImplementation((_file: File, nonce: string) =>
		Promise.resolve({ id: `att_${nonce}`, kind: "file", name: "x.txt", mimeType: "text/plain", size: 3 }),
	);
	const failed = vi.fn().mockRejectedValue(new Error("network"));
	await act(() => result.result.current.submit(failed));
	const ids = local.upload.mock.calls.map((call) => call[1]);
	expect(local.values.has(`blob:alice:att_${ids[0]}`)).toBe(true);
	expect(local.values.has(`blob:alice:att_${ids[1]}`)).toBe(true);
	act(() => result.result.current.removeFile(ids[0] ?? ""));
	await waitFor(() => expect(local.values.has(`blob:alice:att_${ids[0]}`)).toBe(false));
	await act(() => result.result.current.submit(vi.fn().mockResolvedValue({})));
	await waitFor(() => expect(local.values.has(`blob:alice:att_${ids[1]}`)).toBe(false));
});

test("cancelling an in-flight upload aborts it, restores the draft and keeps the file ready", async () => {
	const result = renderHook(() => useChatDraft("alice", "cancel"));
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() => {
		result.result.current.setText("slow upload");
		result.result.current.addFiles([new File(["text"], "notes.txt", { type: "text/plain" })]);
	});
	let reject!: (error: unknown) => void;
	let signal!: AbortSignal | undefined;
	local.upload.mockImplementation(
		(_file: File, _nonce: string, next?: AbortSignal) =>
			new Promise((_resolve, fail) => {
				signal = next;
				reject = fail;
			}),
	);
	const send = vi.fn();
	let pending!: Promise<unknown>;
	act(() => {
		pending = result.result.current.submit(send);
	});
	await waitFor(() => expect(local.upload).toHaveBeenCalledOnce());
	expect(result.result.current.sending).toBe(true);
	expect(signal).toBeInstanceOf(AbortSignal);
	act(() => result.result.current.cancelSend());
	expect(signal?.aborted).toBe(true);
	await act(async () => {
		const abort = new Error("aborted");
		abort.name = "AbortError";
		reject(abort);
		await pending;
	});
	expect(send).not.toHaveBeenCalled();
	expect(result.result.current.sending).toBe(false);
	expect(result.result.current.text).toBe("slow upload");
	expect(result.result.current.files[0]?.status).toBe("ready");
	expect(result.result.current.error).toBe("");
	local.upload.mockResolvedValue({
		id: "att_uploaded",
		kind: "file",
		name: "notes.txt",
		mimeType: "text/plain",
		size: 4,
	});
	await act(() => result.result.current.submit(send));
	expect(send).toHaveBeenCalledOnce();
});

test("a refused send keeps the draft and shows the server's own reason instead of the generic line", async () => {
	const { ApiError } = await import("@yonder/api-client");
	const cases = [
		["visit_limit", "errors.visit_limit"],
		["visit_denied", "errors.visit_denied"],
		["visit_cap", "errors.visit_cap"],
	] as const;
	for (const [code, key] of cases) {
		local.values.clear();
		const result = renderHook(() => useChatDraft("alice", `refused-${code}`));
		await waitFor(() => expect(result.result.current.loaded).toBe(true));
		act(() => result.result.current.setText(`blocked by ${code}`));
		const send = vi.fn().mockRejectedValue(new ApiError({ code, status: 409, message: code }));
		await act(() => result.result.current.submit(send));
		expect(result.result.current.error).toBe(key);
		expect(result.result.current.text).toBe(`blocked by ${code}`);
		result.unmount();
	}
});

test("an ordinary failure and a plain network error keep the generic preserved-draft line", async () => {
	const result = renderHook(() => useChatDraft("alice", "generic"));
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() => result.result.current.setText("still here"));
	await act(() => result.result.current.submit(vi.fn().mockRejectedValue(new Error("network"))));
	expect(result.result.current.error).toBe("chat.sendPreserved");
	expect(result.result.current.text).toBe("still here");
});
