/**
 * The sign-in state, and nothing else.
 *
 * Deliberately small: the person's profile is server state and lives in the query cache, not here
 * (05-前端架构和技术栈 第五节第 1 条: never copy server data into a local store). This store holds
 * only what the server does not know: whether a token is in memory and whether a sign-in is in
 * flight.
 */
import { create } from "zustand";

export type SessionStatus = "unknown" | "signed-in" | "signed-out";

export interface SessionState {
	status: SessionStatus;
	/** True while the first refresh attempt is running, so the shell does not flash the sign-in page. */
	booting: boolean;
	setStatus: (status: SessionStatus) => void;
	setBooting: (booting: boolean) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
	status: "unknown",
	booting: true,
	setStatus: (status) => set({ status }),
	setBooting: (booting) => set({ booting }),
}));
