import { beforeEach, expect, test, vi } from "vitest";

type Subscribe = (listener: () => void) => () => void;
const hook = vi.hoisted(() => ({ subscribe: null as Subscribe | null }));
vi.mock("react", () => ({
	useSyncExternalStore(subscribe: Subscribe, snapshot: () => unknown) {
		hook.subscribe = subscribe;
		return snapshot();
	},
}));
vi.mock("@tarojs/taro", () => ({
	default: {
		getStorageSync() {},
		setStorageSync() {},
		removeStorageSync() {},
		getStorageInfoSync: () => ({ keys: [] }),
		getSystemInfoSync: () => ({ language: "zh-CN" }),
	},
}));

beforeEach(() => {
	vi.resetModules();
	hook.subscribe = null;
});

/** Bound the failure so a live Set iteration cannot hang the test runner. */
function observeResubscription() {
	const subscribe = hook.subscribe;
	if (!subscribe) throw new Error("hook did not subscribe");
	let calls = 0;
	let stop = () => {};
	const listener = () => {
		calls += 1;
		if (calls > 3) throw new Error("notification reentered more than three times");
		stop();
		stop = subscribe(listener);
	};
	stop = subscribe(listener);
	return { calls: () => calls, stop: () => stop() };
}

test("session publication visits a resubscribing observer once", async () => {
	const runtime = await import("./runtime");
	runtime.useSession();
	const observer = observeResubscription();
	try {
		await expect(runtime.bootstrapSession()).resolves.toBeUndefined();
		expect(observer.calls()).toBe(1);
	} finally {
		observer.stop();
	}
});

test("locale publication visits a resubscribing observer once", async () => {
	const i18n = await import("./i18n");
	i18n.useLocale();
	const observer = observeResubscription();
	try {
		expect(() => i18n.setLocale("en")).not.toThrow();
		expect(observer.calls()).toBe(1);
	} finally {
		observer.stop();
	}
});

test("realtime invalidation visits a resubscribing observer once", async () => {
	const realtime = await import("./realtime");
	realtime.useRealtimeRevision();
	const observer = observeResubscription();
	try {
		expect(() => realtime.invalidateRealtime()).not.toThrow();
		expect(observer.calls()).toBe(1);
	} finally {
		observer.stop();
	}
});
