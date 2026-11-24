import type { MeSectionPageProps } from "@yonder/feature-me";
import {
	ChannelSettings,
	ChannelsSection,
	FeishuExternalConversations,
	isMeSection,
	isMessageChannel,
	MeSectionPage,
} from "@yonder/feature-me";
import { BotForm, BotList, BotModelPage, BotSettingsOverview, PrivacySwitches } from "@yonder/feature-members";
import { Button } from "@yonder/ui-components";
import { useBot, useContacts, usePerson } from "@yonder/ui-data";
import { locate, PageFrame } from "@yonder/ui-shell";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { BUILD_VERSION } from "../lib/config.ts";
import { useDeviceModelEndpointRegistration } from "../lib/device-model-native.ts";
import { internalErrorPilot, reportProviderAddFailure } from "../lib/internal-errors.ts";
import { NotFoundPage } from "../pages/not-found-page.tsx";
import { UpdateControls } from "../updates/controls.tsx";
import { useAskMainBot } from "./ask-main-bot.tsx";
import { CheckoutEntry } from "./checkout.tsx";
import { useConnectDevice } from "./connect-device.tsx";
import { ConnectDeviceDownloads } from "./connect-device-downloads.tsx";
import { DesktopCloseBehavior } from "./desktop-close-behavior.tsx";
import { InternalErrorConsent } from "./internal-error-consent.tsx";
import { renderMacPermissionManagement } from "./mac-permissions.tsx";
import { ReceptionLibraryPage } from "./reception-library.tsx";
import { botSettingsPath, channelsSettingsPath } from "./settings-navigation.ts";
import { SocialPersona } from "./social-settings.tsx";
import { useHasPassword } from "./use-has-password.ts";
import type { PageNavigationState } from "./use-page-navigation.ts";
import { WechatWebEntry } from "./wechat-web.tsx";

type SettingsRouteProps = {
	path: string;
	legacy: Pick<MeSectionPageProps, "localFiles" | "onModelDirtyChange">;
	onOpen: (path: string, state?: Omit<PageNavigationState, "tabLocation">) => void;
	onBack: (parent: string) => void;
	onBotDirtyChange: (dirty: boolean) => void;
	onBotDeleted: (conversationId: string | undefined) => void;
};

function SettingsPage({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
	return (
		<PageFrame title={<h1 className="truncate">{title}</h1>}>
			<div className="flex flex-col gap-[var(--spacing-4)]">
				{description ? (
					<p className="px-[var(--spacing-1)] text-caption text-[var(--color-text-tertiary)]">{description}</p>
				) : null}
				{children}
			</div>
		</PageFrame>
	);
}

export function SettingsRoutePage({ path, legacy, ...props }: SettingsRouteProps) {
	const { t } = useTranslation();
	const location = useLocation();
	const navigate = useNavigate();
	const hasPassword = useHasPassword();
	const registerProviderEndpoint = useDeviceModelEndpointRegistration();
	const ask = useAskMainBot();
	const detail = locate(path)?.detail ?? [];
	const [section, page, leaf, extra] = detail;
	const connectDevice = useConnectDevice(section === "connectors" ? "connectors" : "devices", props.onOpen);
	if (!isMeSection(section)) return <NotFoundPage />;
	if ((section === "devices" || section === "connectors") && page === "connect" && !leaf) {
		return (
			<SettingsPage title={t("me.devices.add")}>
				<ConnectDeviceDownloads />
			</SettingsPage>
		);
	}
	if (section === "bots") {
		if (extra) return <NotFoundPage />;
		return page ? (
			<BotSettingsPage botId={page} leaf={leaf} {...props} />
		) : (
			<SettingsPage title={t("bots.myBots")}>
				<BotList onOpen={(id) => props.onOpen(botSettingsPath(id))} />
			</SettingsPage>
		);
	}
	if (section === "channels") {
		const botId = new URLSearchParams(location.search).get("bot") ?? undefined;
		const state = location.state as PageNavigationState | null;
		if (botId && !extra && ((page === "external" && !leaf) || (page === "feishu" && leaf === "external"))) {
			return (
				<SettingsPage title={t("channels.externalConversations")}>
					<FeishuExternalConversations botId={botId} />
				</SettingsPage>
			);
		}
		if (botId && isMessageChannel(page) && !leaf) {
			return (
				<SettingsPage title={t(`channels.${page}`)}>
					<ChannelSettings
						key={`${botId}:${page}`}
						botId={botId}
						provider={page}
						{...(page === "feishu" && {
							onOpenExternal: () => props.onOpen(channelsSettingsPath(botId, "external"), state ?? undefined),
						})}
					/>
				</SettingsPage>
			);
		}
		return page ? (
			<NotFoundPage />
		) : (
			<SettingsPage title={t("channels.title")}>
				<ChannelsSection
					selectedBotId={botId}
					onSelectBot={(botId) => navigate(channelsSettingsPath(botId), { replace: true, state })}
					onOpenChannel={(botId, channel) =>
						props.onOpen(channelsSettingsPath(botId, channel), {
							...state,
							channelParentPath: `${location.pathname}${location.search}`,
						})
					}
				/>
			</SettingsPage>
		);
	}
	if (section !== "reception") {
		return (
			<>
				<MeSectionPage
					{...legacy}
					appVersion={BUILD_VERSION}
					aboutUpdate={<UpdateControls />}
					generalExtra={
						<>
							<DesktopCloseBehavior />
							<InternalErrorConsent />
						</>
					}
					wechatLink={<WechatWebEntry mode="link" />}
					checkoutEntry={<CheckoutEntry />}
					renderDeviceAction={renderMacPermissionManagement}
					registerProviderEndpoint={registerProviderEndpoint}
					onProviderAddFailure={internalErrorPilot() ? reportProviderAddFailure : undefined}
					renderChangePassword={(onDone) => (
						<PasswordSetupForm
							mode={hasPassword ? "change" : "set"}
							onDone={onDone}
							onSkip={onDone}
							showHeading={false}
						/>
					)}
					section={section}
					page={page ?? null}
					onOpenPage={(next) =>
						next ? props.onOpen(`/me/${section}/${encodeURIComponent(next)}`) : props.onBack(`/me/${section}`)
					}
					onOpenDevices={() => props.onOpen("/me/devices")}
					onTryConnector={(draft) => ask(draft, true)}
					onAddDevice={connectDevice.onAddDevice}
					onSignedOut={() => navigate("/sign-in", { replace: true })}
					onOpenLegal={(document) => navigate(`/${document}`, { state: { backgroundLocation: location } })}
					privacy={<PrivacySwitches />}
				/>
				{connectDevice.overlay}
			</>
		);
	}
	return <ReceptionLibraryPage route={detail.slice(1)} onOpen={props.onOpen} onBack={props.onBack} />;
}

function BotSettingsPage({
	botId,
	leaf,
	onOpen,
	onBack,
	onBotDirtyChange,
	onBotDeleted,
}: Pick<SettingsRouteProps, "onOpen" | "onBack" | "onBotDirtyChange" | "onBotDeleted"> & {
	botId: string;
	leaf: string | undefined;
}) {
	const { t } = useTranslation();
	const person = usePerson();
	const defaultBot = useBot();
	const contacts = useContacts();
	const candidate = defaultBot?.id === botId ? defaultBot : contacts.data?.items.find((item) => item.id === botId);
	const bot =
		person && candidate?.kind === "bot" && (candidate === defaultBot || candidate.ownerId === person.id)
			? candidate
			: null;
	if (!bot && contacts.isLoading) {
		return (
			<SettingsPage title={t("bots.myBots")}>
				<p role="status" className="text-caption text-[var(--color-text-secondary)]">
					{t("app.loading")}
				</p>
			</SettingsPage>
		);
	}
	if (!bot && contacts.isError && !contacts.data) {
		return (
			<SettingsPage title={t("bots.myBots")}>
				<div className="flex items-center gap-[var(--spacing-3)]">
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{t("bots.loadFailed")}
					</p>
					<Button variant="link" size="sm" onClick={() => void contacts.refetch()}>
						{t("app.retry")}
					</Button>
				</div>
			</SettingsPage>
		);
	}
	if (!bot) return <NotFoundPage />;

	const path = botSettingsPath(botId);
	const backToBot = () => onBack(path);
	if (leaf === "profile") {
		return (
			<SettingsPage title={t("bots.basicProfile")} description={`@${bot.handle}`}>
				<BotForm key={botId} mode="edit" settings bot={bot} onSaved={backToBot} onDirtyChange={onBotDirtyChange} />
			</SettingsPage>
		);
	}
	if (leaf === "persona") {
		return (
			<SettingsPage
				title={t("members.social.personaTitle")}
				description={t("members.social.personaScope", { name: bot.displayName })}
			>
				<SocialPersona key={botId} botId={botId} onSaved={backToBot} onDirtyChange={onBotDirtyChange} />
			</SettingsPage>
		);
	}
	if (leaf === "model") {
		return (
			<SettingsPage title={t("models.botModelTitle")} description={t("models.botModelHint", { name: bot.displayName })}>
				<BotModelPage bot={bot} />
			</SettingsPage>
		);
	}
	if (leaf) return <NotFoundPage />;
	return (
		<SettingsPage title={bot.displayName}>
			<BotSettingsOverview
				bot={bot}
				onEdit={() => onOpen(`${path}/profile`)}
				onPersona={() => onOpen(`${path}/persona`)}
				onModel={() => onOpen(`${path}/model`)}
				onChannels={() => onOpen(channelsSettingsPath(botId), { channelOriginBotId: botId })}
				onDeleted={(conversationId) => {
					onBack("/me/bots");
					onBotDeleted(conversationId);
				}}
			/>
		</SettingsPage>
	);
}

import { PasswordSetupForm } from "@yonder/feature-auth";
