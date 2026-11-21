import { Captions, Mic, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function useMeetingStartChoice<T>(
	ownerId: string | null,
	start: (target: T, live?: boolean) => void,
	liveOffered: boolean,
) {
	const [pending, setPending] = useState<{ ownerId: string; target: T }>();
	return {
		open(target: T | undefined) {
			if (!ownerId || target === undefined) return;
			if (liveOffered) setPending({ ownerId, target });
			else start(target);
		},
		dialog:
			pending?.ownerId !== ownerId ? null : (
				<MeetingStartChoice
					onClose={() => setPending(undefined)}
					onChoose={(live) => {
						setPending(undefined);
						start(pending.target, live);
					}}
				/>
			),
	};
}

function MeetingStartChoice({ onClose, onChoose }: { onClose: () => void; onChoose: (live: boolean) => void }) {
	const { t } = useTranslation();
	const ref = useRef<HTMLDialogElement>(null);
	useLayoutEffect(() => {
		const node = ref.current;
		if (typeof node?.showModal === "function") node.showModal();
		else node?.setAttribute("open", "");
	}, []);
	return (
		<dialog
			ref={ref}
			className="meeting-start-choice"
			aria-label={t("meetingRecorder.chooseMode")}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			<header>
				<h2>{t("meetingRecorder.chooseMode")}</h2>
				<button type="button" className="meeting-recording-button" aria-label={t("app.close")} onClick={onClose}>
					<X size={20} aria-hidden="true" />
				</button>
			</header>
			<button type="button" className="meeting-recording-button" onClick={() => onChoose(false)}>
				<Mic size={20} aria-hidden="true" />
				{t("meetingRecorder.recordMode")}
			</button>
			<button type="button" className="meeting-recording-button" onClick={() => onChoose(true)}>
				<Captions size={20} aria-hidden="true" />
				{t("meetingRecorder.liveMode")}
			</button>
		</dialog>
	);
}
