import type { AgentCard } from "@yonder/protocol";
import { useEffect, useState } from "react";
import { newerCard } from "../lib/agent-card-view";
import { api, subscribeEvents, useRealtimeRevision, useSession } from "../lib/runtime";
import { errorText } from "./ui";

type Hidden = { status?: number };

/**
 * One owner-only Agent card, kept current: it loads by id, and a card the owner answered on another
 * device, or one the server expired, replaces it in place. A card the server no longer shows this
 * account (not theirs, gone) is absent, not an error: `card` stays null and `error` stays empty.
 */
export function useAgentCard(id: string) {
	const { status, me } = useSession();
	const owner = status === "signed-in" ? me?.member.id : undefined;
	const revision = useRealtimeRevision();
	const [card, setCard] = useState<AgentCard | null>(null);
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const [failedAction, setFailedAction] = useState<string | null>(null);
	useEffect(() => {
		// A reconnect bumps the revision: an update may have been missed, so the card is read again.
		if (!owner || revision < 0) return;
		let active = true;
		void api.agentCard(id).then(
			(value) => {
				if (active) setCard(value);
			},
			(cause: Hidden & Error) => {
				if (!active) return;
				if (cause.status === 401 || cause.status === 403 || cause.status === 404) setCard(null);
				else setError(errorText(cause));
			},
		);
		return () => {
			active = false;
		};
	}, [id, owner, revision]);
	useEffect(
		() =>
			subscribeEvents((event) => {
				if (event.type === "agent-card.updated" && event.card.id === id)
					setCard((current) => newerCard(current, event.card));
			}),
		[id],
	);
	return {
		card,
		error,
		pending,
		failedAction,
		act: async (actionId: string) => {
			if (!card || pending) return;
			setPending(true);
			setFailedAction(null);
			try {
				const result = await api.actOnAgentCard(id, { actionId, version: card.version });
				setCard(result.card);
			} catch (cause) {
				setFailedAction(actionId);
				setError(errorText(cause));
			} finally {
				setPending(false);
			}
		},
	};
}
