import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Component tests share one jsdom document, so a tree left mounted by one test would keep its
// window listeners alive and change what the next test observes. Clean up after every test.
afterEach(() => {
	cleanup();
});

// `apps/web/src/lib/config.ts` reads this identifier; Vite replaces it at build time, so in a test
// it has to exist as a global before any module reads it.
(globalThis as unknown as { __YONDER_VERSION__: string }).__YONDER_VERSION__ = "0.0.0-test";
