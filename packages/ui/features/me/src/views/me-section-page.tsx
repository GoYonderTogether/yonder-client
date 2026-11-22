import type { DeviceSummary } from "@yonder/protocol";
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
import type { ProviderAddFailure, RegisterLocalProviderEndpoint } from "../components/provider-location.ts";
import { parseQuotaPage, QuotaSection, quotaPageTitle } from "../components/quota-section.tsx";
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
	section: Exclude<MeSectionId, "bots" | "reception" | "channels"> | null;
	/** A page inside a section, e.g. `password` inside `account`. */
	page: string | null;
	onOpenPage: (page: string | null) => void;
	onOpenDevices?: () => void;
	onAddDevice?: (platforms?: readonly DeviceSummary["platform"][]) => void;
	renderDeviceAction?: (device: DeviceSummary) => ReactNode;
	localFiles?: LocalFilesAdapter | undefined;
	onModelDirtyChange?: (dirty: boolean) => void;
	registerProviderEndpoint?: RegisterLocalProviderEndpoint | undefined;
	onProviderAddFailure?: ProviderAddFailure | undefined;
	onSignedOut: () => void;
	onOpenLegal: (document: "terms" | "privacy") => void;
	appVersion: string;
	serverVersion: string | null;
	aboutUpdate?: ReactNode;
	generalExtra?: ReactNode;
	wechatLink?: ReactNode;
	checkoutEntry?: ReactNode;
	/** The change-password screen is provided by the app, which owns the auth feature. */
	renderChangePassword: (onDone: () => void) => ReactNode;
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
	renderDeviceAction,
	localFiles,
	onModelDirtyChange,
	registerProviderEndpoint,
	onProviderAddFailure,
	onSignedOut,
	onOpenLegal,
	appVersion,
	serverVersion,
	aboutUpdate,
	generalExtra,
	wechatLink,
	checkoutEntry,
	renderChangePassword,
	privacy,
}: MeSectionPageProps) {
	const { t, i18n } = useTranslation();
	const me = useMe();

	if (!section) {
		return <PageFrame title={null}>{null}</PageFrame>;
	}

	if (section === "account" && page === "password") {
		const title = me.data?.hasPassword ? t("me.account.changePassword") : t("me.account.setPassword");
		return (
			<PageFrame title={<h1 className="truncate">{title}</h1>}>
				{renderChangePassword(() => onOpenPage(null))}
			</PageFrame>
		);
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
	if (section === "quota") {
		const sub = parseQuotaPage(page);
		if (page && !sub) return <PageFrame title={null}>{null}</PageFrame>;
		const title = sub ? quotaPageTitle(sub, t, i18n.resolvedLanguage ?? i18n.language) : t("me.sections.quota");
		return (
			<PageFrame title={<h1 className="truncate">{title}</h1>}>
				<QuotaSection page={page} onOpenPage={(next) => onOpenPage(next)} checkoutEntry={checkoutEntry} />
			</PageFrame>
		);
	}
	if (section === "skills") {
		const title =
			page === "import"
				? "skills.import"
				: page?.startsWith("replace-")
					? "skills.replace"
					: page?.startsWith("view-")
						? "skills.detail"
						: "skills.title";
		return (
			<PageFrame title={<h1 className="truncate">{t(title)}</h1>}>
				<SkillsSection page={page} onOpenPage={onOpenPage} />
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

	function body(id: NonNullable<MeSectionPageProps["section"]>): ReactNode {
		switch (id) {
			case "profile":
				return me.data ? <ProfileEditor person={me.data.member} /> : null;
			case "account":
				return (
					<AccountSection
						onChangePassword={() => onOpenPage("password")}
						onChangePhone={() => onOpenPage("phone")}
						onSignedOut={onSignedOut}
						wechatLink={wechatLink}
						{...(onOpenDevices ? { onOpenDevices } : {})}
					/>
				);
			case "models":
				return (
					<ModelsSection
						page={page}
						onOpenPage={onOpenPage}
						onDirtyChange={onModelDirtyChange}
						registerEndpoint={registerProviderEndpoint}
						onAddFailure={onProviderAddFailure}
					/>
				);
			case "devices":
				return (
					<DevicesSection
						onAddDevice={onAddDevice ? () => onAddDevice() : undefined}
						renderDeviceAction={renderDeviceAction}
					/>
				);
			case "connectors":
				return <ConnectorsSection localFiles={localFiles} onOpenDevices={onOpenDevices} onAddDevice={onAddDevice} />;
			case "invite":
				return <InviteSection />;
			case "general":
				return <GeneralSection>{generalExtra}</GeneralSection>;
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
