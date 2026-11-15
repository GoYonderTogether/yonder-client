import { useMe } from "@yonder/ui-data";
import { PageFrame } from "@yonder/ui-shell";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AboutSection } from "../components/about-section.tsx";
import { AccountSection } from "../components/account-section.tsx";
import { DevicesSection, GeneralSection } from "../components/empty-sections.tsx";
import { InviteSection } from "../components/invite-section.tsx";
import { ModelsSection } from "../components/models-section.tsx";
import { ProfileEditor } from "../components/profile-editor.tsx";
import { QuotaSection } from "../components/quota-section.tsx";
import type { MeSectionId } from "./sections.tsx";

export interface MeSectionPageProps {
	section: MeSectionId | null;
	/** A page inside a section, e.g. `password` inside `account`. */
	page: string | null;
	onOpenPage: (page: string | null) => void;
	onModelDirtyChange?: (dirty: boolean) => void;
	onSignedOut: () => void;
	onOpenLegal: (document: "terms" | "privacy") => void;
	appVersion: string;
	serverVersion: string | null;
	/** The change-password screen is provided by the app, which owns the auth feature. */
	renderChangePassword: (onDone: () => void) => ReactNode;
}

/**
 * One section of 「我」, as a layer-two page: pushed on a phone, in the right-hand column on a
 * desktop. A page inside a section (change password) is the next page of the same layer.
 */
export function MeSectionPage({
	section,
	page,
	onOpenPage,
	onModelDirtyChange,
	onSignedOut,
	onOpenLegal,
	appVersion,
	serverVersion,
	renderChangePassword,
}: MeSectionPageProps) {
	const { t } = useTranslation();
	const me = useMe();

	if (!section) {
		return <PageFrame title={null}>{null}</PageFrame>;
	}

	if (section === "account" && page === "password") {
		return (
			<PageFrame title={me.data?.hasPassword ? t("me.account.changePassword") : t("me.account.setPassword")}>
				{renderChangePassword(() => onOpenPage(null))}
			</PageFrame>
		);
	}

	const title =
		section === "profile"
			? t("me.editProfile")
			: section === "models" && page
				? t(page === "add" || page.startsWith("duplicate-") ? "models.add" : "models.edit")
				: t(`me.sections.${section}`);
	return <PageFrame title={title}>{body(section)}</PageFrame>;

	function body(id: MeSectionId): ReactNode {
		switch (id) {
			case "profile":
				return me.data ? <ProfileEditor person={me.data.member} /> : null;
			case "account":
				return <AccountSection onChangePassword={() => onOpenPage("password")} onSignedOut={onSignedOut} />;
			case "quota":
				return <QuotaSection />;
			case "models":
				return <ModelsSection page={page} onOpenPage={onOpenPage} onDirtyChange={onModelDirtyChange} />;
			case "devices":
				return <DevicesSection />;
			case "invite":
				return <InviteSection />;
			case "general":
				return <GeneralSection />;
			case "about":
				return <AboutSection appVersion={appVersion} serverVersion={serverVersion} onOpenLegal={onOpenLegal} />;
		}
	}
}
