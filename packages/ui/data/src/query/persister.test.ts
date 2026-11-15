import { persistQueryClientRestore, persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";
import { afterEach, expect, test, vi } from "vitest";
import { createMemoryStorage } from "../storage/index.ts";
import { CACHE_STORAGE_KEY, CACHE_VERSION, createPersister, createQueryClient } from "./client.ts";

afterEach(() => vi.useRealTimers());

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
