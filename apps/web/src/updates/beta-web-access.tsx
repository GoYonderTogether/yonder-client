import { ListGroup, ListRow } from "@yonder/ui-components";
import { useSessionStore } from "@yonder/ui-data";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "../lib/keychain.ts";
import { Splash } from "../pages/splash.tsx";
import { BETA_PATH, BETA_SETUP_PARAM, browserBeta, releasePath } from "./channel-path.ts";
import { UpdateControls } from "./controls.tsx";
import { useUpdateSettings } from "./provider.tsx";

export function BetaWebAccess({ children, owner }: { children: ReactNode; owner: string | undefined }) {
	const { t } = useTranslation();
	const signedIn = useSessionStore((state) => state.status === "signed-in");
	const channel = useUpdateSettings()?.state;
	const [admitted, setAdmitted] = useState<string>();
	const location = window.location;
	const preview = !isTauri() && browserBeta(location.pathname);
	const setup =
		location.pathname === `${BETA_PATH}/me/about` && new URLSearchParams(location.search).has(BETA_SETUP_PARAM);
	const alreadyIn = !!owner && admitted === owner;
	const beta = channel?.data?.channel === "beta";
	const initialStable = preview && signedIn && !alreadyIn && channel?.data?.channel === "stable";
	const needsSetup = initialStable && setup && channel?.data?.betaEnabled;
	const returnToStable = preview && ((!signedIn && !!admitted) || (initialStable && !needsSetup));

	useEffect(() => {
		if (preview && owner && beta) {
			if (setup) window.location.replace(releasePath("beta", window.location));
			else setAdmitted(owner);
		}
	}, [beta, owner, preview, setup]);
	useEffect(() => {
		if (returnToStable) window.location.replace(releasePath("stable", window.location));
	}, [returnToStable]);

	if (!preview || (!signedIn && !returnToStable) || alreadyIn || (beta && !setup)) return children;
	if (needsSetup || channel?.isError) {
		return (
			<main className="mx-auto flex w-full max-w-md flex-col gap-[var(--spacing-4)] p-[var(--spacing-4)]">
				<h1>{t("me.update.channelTitle")}</h1>
				{needsSetup ? <UpdateControls /> : null}
				<ListGroup>
					{channel?.isError ? <ListRow title={t("me.update.check")} onClick={() => void channel.refetch()} /> : null}
					<ListRow
						title={t("me.update.stable")}
						onClick={() => window.location.replace(releasePath("stable", window.location))}
					/>
				</ListGroup>
			</main>
		);
	}
	return <Splash />;
}
