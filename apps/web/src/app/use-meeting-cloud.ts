import type { MeetingCloudController, MeetingRecorderController } from "@yonder/feature-meetings";
import { useMeeting, useMeetingActions, useMeetings } from "@yonder/ui-data";
import { useState } from "react";
import { useMeetingUpload } from "./use-meeting-upload.ts";

export function useMeetingCloud(
	ownerId: string | null,
	recorder: MeetingRecorderController,
	target: { id: string; name: string } | null,
	expanded: boolean,
): MeetingCloudController {
	const [selectedId, select] = useState<string | null>(null);
	const [selectedOwner, setSelectedOwner] = useState(ownerId);
	const [preparing, setPreparing] = useState(false);
	const [prepareError, setPrepareError] = useState(false);
	const upload = useMeetingUpload(ownerId, recorder);
	const list = useMeetings(target?.id ?? null, {
		enabled: expanded || upload.jobs.length > 0,
		uploading: upload.jobs.some((job) => ["queued", "uploading"].includes(job.state)),
	});
	const selected = useMeeting(selectedOwner === ownerId ? selectedId : null);
	const actions = useMeetingActions();
	const records = list.data?.items ?? [];
	const resumable = upload.web
		? records.filter(
				(record) =>
					record.status === "uploading" && !upload.jobs.some((job) => job.recordingId === record.clientRecordingId),
			)
		: [];
	return {
		records,
		selected: selected.data,
		jobs: [
			...upload.jobs,
			...resumable.map((record) => ({
				recordingId: record.clientRecordingId,
				conversationId: record.conversationId,
				meetingId: record.id,
				state: "failed" as const,
				errorCode: null,
			})),
		],
		loading: list.isLoading || selected.isLoading,
		error: list.isError || selected.isError || upload.error || prepareError || actions.retry.isError,
		busy: preparing || actions.retry.isPending,
		uploadAvailable: upload.available,
		targetName: target?.name ?? null,
		select(id) {
			setSelectedOwner(ownerId);
			select(id);
		},
		async prepare(recordingId) {
			const recording = recorder.state.recordings.find((item) => item.id === recordingId);
			const conversationId = recording?.conversationId ?? target?.id;
			if (!recording || !conversationId) return;
			setPreparing(true);
			setPrepareError(false);
			try {
				await upload.prepare(recording, conversationId);
				await recorder.reload();
				await list.refetch();
			} catch {
				setPrepareError(true);
			} finally {
				setPreparing(false);
			}
		},
		async retry(id, confirmUnknown) {
			await actions.retry.mutateAsync({ id, confirmUnknown }).catch(() => {});
		},
		reload() {
			setPrepareError(false);
			void list.refetch();
			if (selectedOwner === ownerId && selectedId) void selected.refetch();
		},
	};
}
