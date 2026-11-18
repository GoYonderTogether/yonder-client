import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@yonder/api-client";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

/**
 * A card read by a signed-in viewer: it carries the relation, so the profile can pick its one
 * action without another request. Closed or missing handles are one 404, so a failed read is never
 * retried — a retry could only ask the same question again.
 */
export function useMemberProfile(handle: string | null | undefined) {
	const api = useApi();
	return useQuery({
		queryKey: keys.memberProfile(handle ?? ""),
		queryFn: () => api.memberProfile(handle ?? ""),
		enabled: Boolean(handle),
		// Each card opening, including a new handle in the same view, rechecks visibility.
		staleTime: 0,
		retry: false,
	});
}

/**
 * The same card for someone who is not signed in (`/@handle`). It sends no token, so a visitor
 * with no session sees the card instead of being bounced to sign-in.
 */
export function usePublicMemberProfile(handle: string | null | undefined) {
	const api = useApi();
	return useQuery({
		queryKey: keys.publicMemberProfile(handle ?? ""),
		queryFn: () => api.publicMemberProfile(handle ?? ""),
		enabled: Boolean(handle),
		staleTime: 0,
		// A 404 is the answer for "no such handle" and "closed to you" alike; asking again changes nothing.
		retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 2,
	});
}
