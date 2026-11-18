import { useEffect, useEffectEvent } from "react";
import { useLocation, useNavigate } from "react-router";

/** Older chat links still open the meeting's task result. */
export function useMeetingLink() {
	const location = useLocation();
	const navigate = useNavigate();
	const meetingId = new URLSearchParams(location.search).get("meeting");
	const handle = useEffectEvent((id: string) => {
		navigate(`/tasks/${encodeURIComponent(id)}`, { replace: true });
	});
	useEffect(() => {
		if (meetingId) handle(meetingId);
	}, [meetingId]);
}
