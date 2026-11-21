import { dehydrate } from "@tanstack/react-query";
import { persistQueryClientRestore, persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";
import { afterEach, expect, test, vi } from "vitest";
import { createMemoryStorage } from "../storage/index.ts";
import { CACHE_STORAGE_KEY, CACHE_VERSION, createPersister, createQueryClient, dehydrateOptions } from "./client.ts";
import { keys } from "./keys.ts";

afterEach(() => vi.useRealTimers());

test("does not persist private content and skips legacy cached cards on restore", async () => {
	const client = createQueryClient();
	const path = "/notes/private.md";
	for (const key of [keys.memory.days(), keys.memory.files(""), keys.memory.file(path), keys.memory.revisions(path)]) {
		client.setQueryData(key, "memory data");
	}
	client.setQueryData(keys.me(), "account data");
	client.setQueryData(keys.memberProfile("friend"), "signed-in card");
	client.setQueryData(keys.publicMemberProfile("friend"), "public card");
	client.getMutationCache().build(
		client,
		{ mutationKey: keys.memory.all() },
		{
			context: undefined,
			data: undefined,
			error: null,
			failureCount: 0,
			failureReason: null,
			isPaused: true,
			status: "pending",
			variables: { path, content: "memory data", expectedVersion: 1 },
			submittedAt: 0,
		},
	);
	const result = dehydrate(client, dehydrateOptions);
	expect(result.queries.map(({ queryKey }) => queryKey)).toEqual([keys.me()]);
	expect(result.mutations).toEqual([]);
	const storage = createMemoryStorage();
	storage.set(
		CACHE_STORAGE_KEY,
		JSON.stringify({ buster: CACHE_VERSION, timestamp: Date.now(), clientState: dehydrate(client) }),
	);
	const restored = (await createPersister(storage).restoreClient())?.clientState.queries.map(
		({ queryKey }) => queryKey,
	);
	expect(restored).toContainEqual(keys.me());
	expect(restored).not.toContainEqual(keys.memberProfile("friend"));
	expect(restored).not.toContainEqual(keys.publicMemberProfile("friend"));
	client.clear();
});

test("skips old connector request cards and restores current cards and their device lists", async () => {
	const client = createQueryClient();
	const legacy = keys.connectorRequest("legacy");
	const current = keys.connectorRequest("current");
	const devices = keys.connectorRequestDevices("current");
	client.setQueryData(legacy, { id: "legacy", connectorId: "local-files", state: "pending" });
	client.setQueryData(current, { id: "current", connectorIds: ["local-files"], state: "pending" });
	client.setQueryData(devices, { items: [] });

	const storage = createMemoryStorage();
	storage.set(
		CACHE_STORAGE_KEY,
		JSON.stringify({ buster: CACHE_VERSION, timestamp: Date.now(), clientState: dehydrate(client) }),
	);
	const restored = createQueryClient();
	await persistQueryClientRestore({
		queryClient: restored,
		persister: createPersister(storage),
		buster: CACHE_VERSION,
	});
	expect(restored.getQueryData(legacy)).toBeUndefined();
	expect(restored.getQueryData(current)).toEqual(client.getQueryData(current));
	expect(restored.getQueryData(devices)).toEqual(client.getQueryData(devices));
	client.clear();
	restored.clear();
});

test("coalesces a burst and keeps saving during a continuous stream", async () => {
	vi.useFakeTimers();
	const storage = createMemoryStorage();
	const set = vi.spyOn(storage, "set");
	const persister = createPersister(storage);
	const queryClient = createQueryClient();
	const unsubscribe = persistQueryClientSubscribe({ queryClient, persister, buster: CACHE_VERSION });
	for (let i = 0; i < 100; i++) queryClient.setQueryData(["me"], i);
	expect(set).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1000);
	expect(set).toHaveBeenCalledTimes(1);
	for (let i = 100; i < 125; i++) {
		queryClient.setQueryData(["me"], i);
		await vi.advanceTimersByTimeAsync(100);
	}
	expect(set).toHaveBeenCalledTimes(3);
	await vi.advanceTimersByTimeAsync(1000);
	expect(set).toHaveBeenCalledTimes(4);
	const restored = createQueryClient();
	await persistQueryClientRestore({ queryClient: restored, persister, buster: CACHE_VERSION });
	expect(restored.getQueryData(["me"])).toBe(124);
	unsubscribe();
});

test("removal cancels pending writes, and disposal flushes only once and can be reactivated", async () => {
	vi.useFakeTimers();
	const storage = createMemoryStorage();
	const set = vi.spyOn(storage, "set");
	const persister = createPersister(storage);
	const queryClient = createQueryClient();
	const unsubscribe = persistQueryClientSubscribe({ queryClient, persister, buster: CACHE_VERSION });
	queryClient.setQueryData(["me"], "old account");
	await persister.removeClient();
	await vi.advanceTimersByTimeAsync(1000);
	expect(storage.get(CACHE_STORAGE_KEY)).toBeNull();
	queryClient.setQueryData(["me"], "new account");
	await vi.advanceTimersByTimeAsync(1000);
	expect((await persister.restoreClient())?.clientState.queries[0]?.state.data).toBe("new account");
	queryClient.setQueryData(["me"], "latest");
	persister.dispose();
	expect(set).toHaveBeenCalledTimes(2);
	queryClient.setQueryData(["me"], "after unmount");
	await vi.advanceTimersByTimeAsync(1000);
	expect(set).toHaveBeenCalledTimes(2);
	persister.activate();
	queryClient.setQueryData(["me"], "remounted");
	await vi.advanceTimersByTimeAsync(1000);
	expect(set).toHaveBeenCalledTimes(3);
	expect((await persister.restoreClient())?.clientState.queries[0]?.state.data).toBe("remounted");
	unsubscribe();
});

test("discards corrupt cache and ignores failed writes", async () => {
	vi.useFakeTimers();
	const storage = createMemoryStorage();
	storage.set(CACHE_STORAGE_KEY, "{");
	const persister = createPersister(storage);
	expect(await persister.restoreClient()).toBeUndefined();
	expect(storage.get(CACHE_STORAGE_KEY)).toBeNull();
	vi.spyOn(storage, "set").mockImplementation(() => {
		throw new Error("quota");
	});
	const queryClient = createQueryClient();
	const unsubscribe = persistQueryClientSubscribe({ queryClient, persister });
	queryClient.setQueryData(["me"], "value");
	await vi.advanceTimersByTimeAsync(1000);
	expect(queryClient.getQueryData(["me"])).toBe("value");
	unsubscribe();
});
