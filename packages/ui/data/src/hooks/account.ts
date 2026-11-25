/**
 * Server state hooks. Every one of them reads the cache and writes it back; none of them keeps a
 * copy in component state (05 第五节第 1 条).
 *
 * The profile hooks are optimistic where the brief requires it: a name or avatar change shows
 * immediately and rolls back if the server refuses (brief rule 4, 08 第八节).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@yonder/api-client";
import type { Member, MeResponse, UpdateMeRequest } from "@yonder/protocol";
import { useSessionStore } from "../auth/session-store.ts";
import { prepareAvatarImage } from "../image-encoding.ts";
import { keys } from "../query/keys.ts";
import { useApi, useData, useDataQueryClient } from "../query/provider.tsx";

/**
 * The person and their Bot. Restored from the persisted cache before the network answers.
 *
 * The account's time zone and language live in this answer, so a change made on another device must
 * arrive here without a restart: the query re-reads on every window refocus (the global client turns
 * that off for the rest) and on every realtime (re)connect, which is where the other device's write
 * lands. It also refetches at least every ten minutes while open, so a device left alone long enough
 * still agrees. `staleTime: 0` is what makes those refetches happen; the cache still paints first.
 */
export function useMe(options: { enabled?: boolean } = {}) {
	const api = useApi();
	return useQuery({
		queryKey: keys.me(),
		queryFn: () => api.me(),
		enabled: options.enabled ?? true,
		staleTime: 0,
		refetchOnWindowFocus: "always",
		refetchOnReconnect: "always",
		refetchInterval: 10 * 60_000,
		refetchIntervalInBackground: false,
	});
}

export function useUpdateMe() {
	const api = useApi();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (patch: UpdateMeRequest) => api.updateMe(patch),
		// Optimistic: the new name is on screen before the request leaves.
		onMutate: async (patch) => {
			await queryClient.cancelQueries({ queryKey: keys.me() });
			const previous = queryClient.getQueryData<MeResponse>(keys.me());
			if (previous && patch.displayName !== undefined) {
				queryClient.setQueryData<MeResponse>(keys.me(), {
					...previous,
					member: { ...previous.member, displayName: patch.displayName },
				});
			}
			return { previous };
		},
		onError: (_error, _patch, context) => {
			if (context?.previous) queryClient.setQueryData(keys.me(), context.previous);
		},
		onSuccess: (me) => queryClient.setQueryData(keys.me(), me),
	});
}

/**
 * Uploading an avatar is two steps — bytes, then the profile — and both are optimistic in the same
 * way: the local preview shows at once, the server's address replaces it when it arrives.
 */
export function useUploadAvatar() {
	const api = useApi();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (file: Blob) => api.uploadAvatar(await prepareAvatarImage(file)),
		onSuccess: (me) => queryClient.setQueryData(keys.me(), me),
	});
}

/** What the server reports about itself; 「关于」 shows the version so a report can quote both. */
export function useHealth() {
	const api = useApi();
	return useQuery({
		queryKey: keys.health(),
		queryFn: () => api.health(),
		staleTime: 60_000,
		retry: false,
	});
}

export function useSessions(options: { enabled?: boolean } = {}) {
	const api = useApi();
	return useQuery({
		queryKey: keys.sessions(),
		queryFn: () => api.sessions(),
		enabled: options.enabled ?? true,
		staleTime: 30_000,
	});
}

export function useRevokeSession() {
	const api = useApi();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.revokeSession(id),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: keys.sessions() }),
				queryClient.invalidateQueries({ queryKey: keys.devices() }),
			]);
		},
	});
}

export function useSignOut() {
	const api = useApi();
	const { signOutLocal } = useData();
	return useMutation({
		mutationFn: async () => {
			try {
				await api.signOut();
			} catch (error) {
				// The session may already be gone; either way the local trace must go.
				if (!(error instanceof ApiError)) throw error;
			}
		},
		onSettled: () => signOutLocal(),
	});
}

export function useSetPassword() {
	const api = useApi();
	return useMutation({
		mutationFn: (body: Parameters<typeof api.setPassword>[0]) => api.setPassword(body),
	});
}

export function useChangeHandle() {
	const api = useApi();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (handle: string) => api.changeHandle(handle),
		onSuccess: (result) => queryClient.setQueryData(keys.me(), result.me),
	});
}

export function usePhoneChange() {
	const api = useApi();
	const queryClient = useQueryClient();
	return {
		sendCode: useMutation({ mutationFn: (target?: string) => api.sendPhoneChangeCode(target ? { target } : {}) }),
		change: useMutation({
			mutationFn: (body: Parameters<typeof api.changePhone>[0]) => api.changePhone(body),
			onSuccess: (me) => queryClient.setQueryData(keys.me(), me),
		}),
	};
}

/** Deleting the account takes a code sent to the account's own number, then the code and the handle. */
export function useDeleteAccount() {
	const api = useApi();
	const { signOutLocal } = useData();
	return {
		sendCode: useMutation({ mutationFn: () => api.sendDeleteAccountCode() }),
		confirm: useMutation({
			mutationFn: (body: Parameters<typeof api.deleteAccount>[0]) => api.deleteAccount(body),
			onSuccess: () => signOutLocal(),
		}),
	};
}

/** Drop the cached profile after a sign-in, so the previous account never flashes. */
export function useResetAccountCache() {
	const queryClient = useDataQueryClient();
	return () => {
		queryClient.clear();
		useSessionStore.getState().setStatus("signed-in");
	};
}

/** The member whose avatar and name the shell shows. */
export function usePerson(): Member | undefined {
	return useMe().data?.member;
}

export function useBot(): Member | undefined {
	return useMe().data?.bot;
}
