import { Button } from "@yonder/ui-components";
import { useMeeting } from "@yonder/ui-data";
import { useOptionalSidePanel } from "@yonder/ui-shell";
import { ICON_SIZE } from "@yonder/ui-tokens";
import { Mic } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MeetingReading, type MeetingReadingMode } from "./item-meeting-reader.tsx";
import { FullTaskLink } from "./task-open-link.tsx";

type MeetingReadingLocation = { mode?: MeetingReadingMode; source?: string };

export function useOpenMeetingDetail() {
	const side = useOptionalSidePanel();
	const { t } = useTranslation();
	return (id: string, title?: string, options?: MeetingReadingLocation): boolean => {
		if (!side) return false;
		side.open({
			key: `meeting:${id}`,
			title: title?.trim() || t("meetingRecorder.defaultTitle"),
			icon: <Mic size={ICON_SIZE.sm} aria-hidden="true" />,
			content: <MeetingDetail id={id} options={options} />,
		});
		return true;
	};
}

function MeetingDetail({ id, options }: { id: string; options: MeetingReadingLocation | undefined }) {
	const { t } = useTranslation();
	const query = useMeeting(id);
	const [location, setLocation] = useState(options);
	const [requested, setRequested] = useState(options);
	// Opening an already visible meeting from a new citation should land at that citation.
	if (options?.source && options !== requested) {
		setRequested(options);
		setLocation(options);
	}
	if (!query.data)
		return (
			<div role="status" className="p-[var(--spacing-4)] text-[var(--color-text-secondary)]">
				{t(query.isError ? "app.loadFailed" : "app.loading")}
				{query.isError ? (
					<Button variant="link" onClick={() => void query.refetch()}>
						{t("app.retry")}
					</Button>
				) : null}
			</div>
		);
	return (
		<div className="recording-reader-pane" data-recording-reader>
			<MeetingReading
				meeting={query.data}
				mode={location?.mode ?? (query.data.summary?.trim() ? "notes" : "original")}
				source={location?.source ?? null}
				anchorRequest={location}
				onRead={(mode, source) => setLocation({ mode, ...(source ? { source } : {}) })}
			/>
			<FullTaskLink id={id} />
		</div>
	);
}
