import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SaveSkillRequest, UpdateSkillRequest } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

export function useSkills() {
	const api = useApi();
	return useQuery({
		queryKey: keys.skills.list(),
		queryFn: () => api.skills(),
		staleTime: 30_000,
		refetchOnWindowFocus: true,
	});
}

export function useSkill(id: string) {
	const api = useApi();
	return useQuery({ queryKey: keys.skills.detail(id), queryFn: () => api.skill(id), enabled: Boolean(id) });
}

export function useSkillFile(id: string, revision: string, path: string) {
	const api = useApi();
	return useQuery({
		queryKey: keys.skills.file(id, revision, path),
		queryFn: () => api.skillFile(id, path),
		enabled: Boolean(id && revision && path),
		gcTime: 0,
		staleTime: 0,
	});
}

export function useSkillActions() {
	const api = useApi();
	const client = useQueryClient();
	const refresh = () => client.invalidateQueries({ queryKey: keys.skills.all() });
	return {
		create: useMutation({ mutationFn: (body: SaveSkillRequest) => api.createSkill(body), onSuccess: refresh }),
		update: useMutation({
			mutationFn: ({ id, ...body }: UpdateSkillRequest & { id: string }) => api.updateSkill(id, body),
			onSuccess: refresh,
		}),
		remove: useMutation({
			mutationFn: (id: string) => api.deleteSkill(id),
			onSuccess: async (_result, id) => {
				client.removeQueries({ queryKey: keys.skills.detail(id) });
				client.removeQueries({ queryKey: keys.skills.files(id) });
				await refresh();
			},
		}),
	};
}
