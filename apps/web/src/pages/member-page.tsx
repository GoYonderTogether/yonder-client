import { IconButton } from "@yonder/ui-components";
import { saveInvite, useData, useResolvedInvite, useSessionStore } from "@yonder/ui-data";
import { ChevronLeft } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { cardInviteCode } from "../lib/card-link.ts";
import { isMacDesktopShell } from "../lib/platform.ts";
import { MemberCardView, PublicMemberCard } from "./member-card.tsx";
import { Splash } from "./splash.tsx";

/**
 * `/@对外号`: the same card in two shells (17 3.7). Signed out it is a centred public column with
 * the way in and the download; signed in it is the card plus its one action. Both are a page rather
 * than a layer, because a card path is outside the frame's own route tree (`locate` in ui-shell
 * knows only tabs and 「我」), and giving the frame a third tree would restructure a file other work
 * is editing. The back control returns through history the way the legal pages do.
 */
export function MemberCardPage({ handle }: { handle: string }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const status = useSessionStore((state) => state.status);
	const booting = useSessionStore((state) => state.booting);
	const { storage } = useData();
	// A card shared with its owner's invite code: a stranger who signs up from it counts as invited.
	const code = cardInviteCode(location.search);
	const invite = useResolvedInvite(code, !booting && status === "signed-out");
	useEffect(() => {
		if (code && invite.data?.valid) saveInvite(storage, code);
	}, [code, invite.data?.valid, storage]);

	if (booting || status === "unknown") return <Splash />;
	const signedIn = status === "signed-in";
	const home = () => navigate(signedIn ? "/messages" : "/", { replace: true });
	const back = () => {
		if (window.history.state?.idx > 0) navigate(-1);
		else home();
	};

	return (
		<main className="min-h-dvh bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
			<header
				className={`sticky top-0 z-10 bg-[var(--color-bg-base)] ${isMacDesktopShell() ? "pt-[var(--spacing-10)]" : "pt-[var(--safe-area-top,env(safe-area-inset-top))]"}`}
			>
				<div className="mx-auto w-full max-w-[560px] px-[var(--spacing-4)] py-[var(--spacing-2)]">
					<IconButton aria-label={t("app.back")} onClick={back} autoFocus>
						<ChevronLeft size={24} strokeWidth={1.8} aria-hidden="true" />
					</IconButton>
				</div>
			</header>
			<div className="mx-auto w-full max-w-[560px] px-[var(--spacing-4)] pb-[max(var(--spacing-12),var(--safe-area-bottom,env(safe-area-inset-bottom)))]">
				<div className="rounded-[var(--radius-panel)] bg-[var(--color-bg-surface)] py-[var(--spacing-2)]">
					{signedIn ? (
						<MemberCardView
							handle={handle}
							onOpenConversation={(id) => navigate(`/messages/${encodeURIComponent(id)}`)}
							onOpenOwner={(owner) => navigate(`/@${encodeURIComponent(owner)}`)}
							onOpenBot={(bot) => navigate(`/@${encodeURIComponent(bot)}`)}
							onOpenPrivacy={() => navigate("/me/privacy")}
							onHome={home}
						/>
					) : (
						<PublicMemberCard
							handle={handle}
							onSignIn={() => navigate(`/sign-in?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`)}
							onDownload={() => navigate("/download")}
							onHome={home}
						/>
					)}
				</div>
			</div>
		</main>
	);
}
