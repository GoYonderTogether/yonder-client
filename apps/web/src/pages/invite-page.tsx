import { ApiError, clearInvite, saveInvite, useData, useResolvedInvite, useSessionStore } from "@yonder/ui-data";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { isTauri } from "../lib/keychain.ts";

/** Save a valid invitation before continuing to the web landing or shell sign-in. */
export function InvitePage() {
	const { code = "" } = useParams();
	const { storage } = useData();
	const status = useSessionStore((state) => state.status);
	const booting = useSessionStore((state) => state.booting);
	const navigate = useNavigate();
	const invite = useResolvedInvite(code, !booting && status === "signed-out");

	useEffect(() => {
		if (booting || status === "unknown") return;
		if (status === "signed-in") {
			navigate("/messages", { replace: true });
		} else if (invite.data?.valid) {
			saveInvite(storage, code);
			navigate(isTauri() ? "/sign-in" : "/", { replace: true });
		} else if (invite.isError) {
			if (invite.error instanceof ApiError && invite.error.status === 404) clearInvite(storage);
			navigate("/", { replace: true });
		}
	}, [booting, code, invite.data, invite.error, invite.isError, navigate, status, storage]);

	return null;
}
