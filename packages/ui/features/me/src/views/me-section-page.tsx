import { useMe } from "@yonder/ui-data";
import { PageFrame } from "@yonder/ui-shell";
import { lazy, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AboutSection } from "../components/about-section.tsx";
import { AccountSection } from "../components/account-section.tsx";
import { ChangePhoneForm } from "../components/change-phone-form.tsx";
import { DevicesSection } from "../components/devices-section.tsx";
import { GeneralSection } from "../components/empty-sections.tsx";
import { InviteSection } from "../components/invite-section.tsx";
import { ProfileEditor } from "../components/profile-editor.tsx";
import { QuotaSection } from "../components/quota-section.tsx";
import { ConnectorsSection } from "../connectors/connectors-section.tsx";
import type { LocalFilesAdapter } from "../connectors/local-files-adapter.ts";
import type { MeSectionId } from "./sections.tsx";

const ModelsSection = lazy(() =>
	import("../components/models-section.tsx").then((module) => ({ default: module.ModelsSection })),
);

const SkillsSection = lazy(() =>
	import("../skills/skills-section.tsx").then((module) => ({ default: module.SkillsSection })),
);

export interface MeSectionPageProps {
	section: MeSectionId | null;
	/** A page inside a section, e.g. `password` inside `account`. */
	page: string | null;
	onOpenPage: (page: string | null) => void;
	onOpenDevices?: () => void;
	onAddDevice?: () => void;
	localFiles?: LocalFilesAdapter | undefined;
	onModelDirtyChange?: (dirty: boolean) => void;
	onSignedOut: () => void;
	onOpenLegal: (document: "terms" | "privacy") => void;
	appVersion: string;
	serverVersion: string | null;
	aboutUpdate?: ReactNode;
	/** The change-password screen is provided by the app, which owns the auth feature. */
	renderChangePassword: (onDone: () => void) => ReactNode;
	/**
	 * The Bot list belongs to `feature-members`, which this package may not import (dependency map);
	 * the app passes the rendered list in, the way it already passes the password screen.
	 */
	bots?: ReactNode;
	/**
	 * The three privacy switches likewise live in `feature-members`; the app passes the rendered
	 * switches in, the same way it passes the Bot list.
	 */
	privacy?: ReactNode;
}

/**
 * One section of 「我」, as a layer-two page: pushed on a phone, in the right-hand column on a
 * desktop. A page inside a section (change password) is the next page of the same layer.
 */
export function MeSectionPage({
	section,
	page,
	onOpenPage,
	onOpenDevices,
	onAddDevice,
	localFiles,
	onModelDirtyChange,
	onSignedOut,
	onOpenLegal,
	appVersion,
	serverVersion,
	aboutUpdate,
	renderChangePassword,
	bots,
	privacy,
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

	if (section === "bots") {
		return <PageFrame title={t("bots.title")}>{bots ?? null}</PageFrame>;
	}

	if (section === "privacy") {
		return <PageFrame title={t("members.privacy.title")}>{privacy ?? null}</PageFrame>;
	}

	if (section === "account" && page === "phone") {
		return (
			<PageFrame title={t("me.phoneChange.title")}>
				<ChangePhoneForm onDone={() => onOpenPage(null)} />
			</PageFrame>
		);
	}

	const title =
		section === "profile"
			? t("me.editProfile")
			: section === "invite"
				? t("inviteExperience.title")
				: section === "models" && page
					? t(page === "add" || page.startsWith("duplicate-") ? "models.add" : "models.edit")
					: t(`me.sections.${section}`);
	return (
		<PageFrame title={title} width={section === "connectors" ? "full" : "reading"}>
			{body(section)}
		</PageFrame>
	);

	function body(id: MeSectionId): ReactNode {
		switch (id) {
			case "profile":
				return me.data ? <ProfileEditor person={me.data.member} /> : null;
			case "account":
				return (
					<AccountSection
						onChangePassword={() => onOpenPage("password")}
						onChangePhone={() => onOpenPage("phone")}
						onSignedOut={onSignedOut}
						{...(onOpenDevices ? { onOpenDevices } : {})}
					/>
				);
			case "quota":
				return <QuotaSection />;
			case "models":
				return <ModelsSection page={page} onOpenPage={onOpenPage} onDirtyChange={onModelDirtyChange} />;
			case "devices":
				return <DevicesSection {...(onAddDevice ? { onAddDevice } : {})} />;
			case "connectors":
				return <ConnectorsSection localFiles={localFiles} onOpenDevices={onOpenDevices} />;
			case "skills":
				return <SkillsSection page={page} onOpenPage={onOpenPage} />;
			case "invite":
				return <InviteSection />;
			case "general":
				return <GeneralSection />;
			case "about":
				return (
					<AboutSection
						appVersion={appVersion}
						serverVersion={serverVersion}
						onOpenLegal={onOpenLegal}
						update={aboutUpdate}
					/>
				);
		}
	}
}
