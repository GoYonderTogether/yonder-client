/**
 * One in-flight command's bookkeeping. Kept here so `local-files-runtime.tsx` holds the flow,
 * not the vocabulary. The error codes it agrees on with the device live in `local-files-errors.ts`.
 */

import type { beginTrayConnectorWork } from "./tray-bridge.ts";

export type PendingCommand = {
	cancelled: boolean;
	apple: boolean;
	terminal: boolean;
	desktop: boolean;
	browser: boolean;
	connectionId: string;
	revision: number;
	upload?: AbortController;
	tray?: ReturnType<typeof beginTrayConnectorWork>;
};
