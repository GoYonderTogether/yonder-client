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
import { keys } from "../query/keys.ts";
import { useApi, useData, useDataQueryClient } from "../query/provider.tsx";

/** The person and their Bot. Restored from the persisted cache before the network answers. */
export function useMe(options: { enabled?: boolean } = {}) {
	const api = useApi();
	return useQuery({
		queryKey: keys.me(),
		queryFn: () => api.me(),
		enabled: options.enabled ?? true,
		staleTime: 5 * 60_000,
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
		mutationFn: (file: Blob) => api.uploadAvatar(file),
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
		onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.sessions() }),
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

export function useDeleteAccount() {
	const api = useApi();
	const { signOutLocal } = useData();
	return useMutation({
		mutationFn: (body: { confirmHandle: string }) => api.deleteAccount(body),
		onSuccess: () => signOutLocal(),
	});
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
