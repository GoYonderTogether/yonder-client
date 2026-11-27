import { saveInvite, useData, useSessionStore } from "@yonder/ui-data";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";

/** Continue through the common identity and invitation flow, with the linked code prefilled. */
export function InvitePage() {
	const { code = "" } = useParams();
	const { storage } = useData();
	const status = useSessionStore((state) => state.status);
	const booting = useSessionStore((state) => state.booting);
	const navigate = useNavigate();

	useEffect(() => {
		if (booting || status === "unknown") return;
		if (status === "signed-in") {
			navigate("/messages", { replace: true });
		} else {
			if (/^[a-z0-9_-]{1,64}$/i.test(code)) saveInvite(storage, code);
			navigate("/sign-in", { replace: true });
		}
	}, [booting, code, navigate, status, storage]);

	return null;
}
