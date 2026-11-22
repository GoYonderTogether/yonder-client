import { type CSSProperties, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

// The recorder supplies readings at about 100 ms intervals. Draw only readings actually taken.
export function MeetingWaveform({ elapsedMs, level }: { elapsedMs: number; level?: number | undefined }) {
	const { t } = useTranslation();
	const [samples, setSamples] = useState<{ elapsedMs: number; level: number }[]>([]);
	useEffect(() => {
		if (level === undefined) return;
		setSamples((previous) =>
			elapsedMs <= (previous.at(-1)?.elapsedMs ?? -1) ? previous : [...previous.slice(-99), { elapsedMs, level }],
		);
	}, [elapsedMs, level]);

	return (
		<div className="meeting-level-bars">
			{level !== undefined ? (
				<meter
					className="sr-only"
					min={0}
					max={100}
					value={Math.round(level * 100)}
					aria-label={t("meetingRecorder.audioLevel")}
				/>
			) : null}
			{samples.map((sample) => (
				<span key={sample.elapsedMs} style={{ "--level": sample.level } as CSSProperties} aria-hidden="true" />
			))}
		</div>
	);
}
