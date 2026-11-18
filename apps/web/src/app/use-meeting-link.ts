import { useEffect, useEffectEvent } from "react";
import { useLocation, useNavigate } from "react-router";

/**
 * `?meeting=<id>` on a chat (a memory file's source, 24 第七节) opens that meeting in the recording
 * capsule, then leaves the URL so going back does not open it again.
 */
export function useMeetingLink(open: (meetingId: string) => void) {
	const location = useLocation();
	const navigate = useNavigate();
	const meetingId = new URLSearchParams(location.search).get("meeting");
	const handle = useEffectEvent((id: string) => {
		open(id);
		navigate(location.pathname, { replace: true, state: location.state });
	});
	useEffect(() => {
		if (meetingId) handle(meetingId);
	}, [meetingId]);
}
