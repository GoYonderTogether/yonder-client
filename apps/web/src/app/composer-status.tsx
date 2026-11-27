import type { useCompactConversation } from "@yonder/ui-data";
import { CompactStatus } from "./completion/compact-status.tsx";
import { useNowItems } from "./now-items.tsx";
import { NowStrip } from "./now-strip.tsx";
import { useNearNow } from "./use-near-now.ts";

/**
 * The composer's status slot: what the present has to show above the input (running tasks, items
 * waiting on the owner), then the result of the compact command. The input itself stays the one
 * composer the main Bot chat uses; this slot only adds cards over it.
 */
export function ComposerStatus({ compact }: { compact: ReturnType<typeof useCompactConversation> }) {
	const now = useNowItems();
	const near = useNearNow();
	return (
		<>
			{now.length ? (
				<div
					inert={!near}
					className={`pointer-events-none absolute inset-x-0 bottom-full z-40 transition-[opacity,translate] duration-300 motion-reduce:transition-none ${near ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
				>
					<NowStrip items={now} />
				</div>
			) : null}
			<CompactStatus command={compact} />
		</>
	);
}
