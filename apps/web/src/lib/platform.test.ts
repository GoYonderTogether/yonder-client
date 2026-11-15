// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { isDesktopExperience } from "./platform.ts";

afterEach(() => vi.unstubAllGlobals());

test("desktop identity survives narrow widths while mobile hosts keep mobile controls", () => {
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 0 });
	expect(isDesktopExperience()).toBe(true);
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)", maxTouchPoints: 0 });
	expect(isDesktopExperience()).toBe(true);
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS)", maxTouchPoints: 5 });
	expect(isDesktopExperience()).toBe(false);
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 16)", maxTouchPoints: 5 });
	expect(isDesktopExperience()).toBe(false);
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 5 });
	expect(isDesktopExperience()).toBe(false);
});

test("native edge geometry requires a mobile Tauri host, including desktop-UA iPads", async () => {
	const { initializeNativeMobile } = await import("./platform.ts");
	const root = document.documentElement;
	delete root.dataset.nativeMobile;
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS)", maxTouchPoints: 5 });
	initializeNativeMobile();
	expect(root).not.toHaveAttribute("data-native-mobile");
	vi.stubGlobal("__TAURI_INTERNALS__", {});
	initializeNativeMobile();
	expect(root).toHaveAttribute("data-native-mobile", "true");
	delete root.dataset.nativeMobile;
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 0 });
	initializeNativeMobile();
	expect(root).not.toHaveAttribute("data-native-mobile");
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 5 });
	initializeNativeMobile();
	expect(root).toHaveAttribute("data-native-mobile", "true");
	delete root.dataset.nativeMobile;
});

test("reads only valid native inset dimensions and leaves env fallback for unavailable geometry", async () => {
	const { initializeNativeMobile } = await import("./platform.ts");
	vi.stubGlobal("__TAURI_INTERNALS__", {});
	vi.stubGlobal("navigator", { userAgent: "Android", maxTouchPoints: 5 });
	vi.stubGlobal("YonderInsets", { getInsets: () => JSON.stringify({ top: 30, bottom: 24, right: -1, left: "bad" }) });
	initializeNativeMobile();
	const root = document.documentElement;
	expect(root.style.getPropertyValue("--native-safe-area-inset-top")).toBe("30px");
	expect(root.style.getPropertyValue("--native-safe-area-inset-bottom")).toBe("24px");
	expect(root.style.getPropertyValue("--native-safe-area-inset-right")).toBe("");
	expect(root.style.getPropertyValue("--native-safe-area-inset-left")).toBe("");
	vi.stubGlobal("YonderInsets", { getInsets: () => "unavailable" });
	expect(() => initializeNativeMobile()).not.toThrow();
	root.style.removeProperty("--native-safe-area-inset-top");
	root.style.removeProperty("--native-safe-area-inset-bottom");
	delete root.dataset.nativeMobile;
});
