import { Button } from "@yonder/ui-components";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./items.css";

/**
 * The plus button's visual answer (16-3 第十节): a sentence flies into the message box. The draft is
 * already filled and navigation already happened when this mounts, so nothing here is load-bearing —
 * it is transform and opacity only, it never takes a pointer, and it can be dismissed or timed out
 * without affecting what the user types. Reduced motion is handled by the token block, which sets
 * every duration to zero.
 */
export function FlyToComposer({ phrase, onDone }: { phrase: string; onDone: () => void }) {
	const { t } = useTranslation();
	const [gone, setGone] = useState(false);
	const timer = useRef<number | undefined>(undefined);
	useEffect(() => {
		timer.current = window.setTimeout(() => setGone(true), 1_600);
		return () => window.clearTimeout(timer.current);
	}, []);
	useEffect(() => {
		if (gone) onDone();
	}, [gone, onDone]);
	if (gone) return null;
	return (
		<div className="items-fly" role="status" aria-live="polite">
			<span className="items-fly-phrase">{phrase}</span>
			<Button size="sm" variant="link" onClick={() => setGone(true)}>
				{t("tasks.flyCancel")}
			</Button>
		</div>
	);
}
