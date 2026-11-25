import {
	DataProvider,
	useData,
	useDeviceRegistration,
	useLocalePreference,
	useMe,
	useRealtimeSync,
	useSessionStore,
	useTheme,
} from "@yonder/ui-data";
import type { Locale } from "@yonder/ui-i18n";
import { createI18n } from "@yonder/ui-i18n";
import { useEffect, useMemo, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { apiBaseUrl, BUILD_VERSION } from "../lib/config.ts";
import { createContactStorage } from "../lib/contact-preferences.ts";
import {
	closeContactWindow,
	isContactWindow,
	requestMainAccessToken,
	serveContactWindowSession,
} from "../lib/contact-window.ts";
import { loadSystemDeviceName, SystemDeviceName, useDeviceInfo } from "../lib/device-info.ts";
import { DeviceModelRuntime } from "../lib/device-model-runtime.tsx";
import { DeviceModelWireRuntime } from "../lib/device-model-wire-runtime.tsx";
import type { KeychainStorage } from "../lib/keychain.ts";
import { createKeychainStorage, isTauri } from "../lib/keychain.ts";
import { appleResourcesSupported, localFilesSupported, resetLocalFiles } from "../lib/local-files.ts";
import { LocalFilesRuntime } from "../lib/local-files-runtime.tsx";
import { resetMeetingRecorder } from "../lib/meeting-recorder.ts";
import { isNativeMobileNotifications } from "../lib/native-notifications.ts";
import { ProviderRelayRuntime, providerRelaySupported } from "../lib/provider-relay-runtime.tsx";
import { UpdateOfferProvider, UpdateProvider } from "../updates/provider.tsx";
import { AppNoticeProvider } from "./app-notice.tsx";
import { ConnectorContinuationNotices } from "./connector-continuation-notices.tsx";
import { MacPermissionsGate } from "./mac-permissions.tsx";
import { NativePushRegistration } from "./native-push-registration.tsx";
import { AppRouter } from "./router.tsx";
import { WebPushRegistration } from "./web-push-registration.tsx";

/**
 * Assembly only: providers, then the router. This file may import every layer; nothing else in the
 * app does more than pick a page.
 */
export function App() {
	const contactStorage = useMemo(() => (isContactWindow() ? createContactStorage() : undefined), []);
	const needsShellBoot = isTauri() && !contactStorage;
	// Read the native device name alongside the keychain so sign-in and session restoration agree.
	const [shell, setShell] = useState<{ keychain: KeychainStorage; name: string | null } | null>(null);

	useEffect(() => {
		if (!needsShellBoot) return;
		let cancelled = false;
		void Promise.all([createKeychainStorage(), loadSystemDeviceName()]).then(async ([keychain, name]) => {
			await keychain.ready;
			if (!cancelled) setShell({ keychain, name });
		});
		return () => {
			cancelled = true;
		};
	}, [needsShellBoot]);

	if (needsShellBoot && !shell) return <BootSplash />;

	return (
		<DataProvider
			baseUrl={apiBaseUrl({ shell: isTauri(), dev: import.meta.env.DEV })}
			appVersion={BUILD_VERSION}
			clientKind={isTauri() ? "shell" : "web"}
			{...(shell ? { refreshTokenStorage: shell.keychain } : {})}
			{...(isContactWindow() ? { refreshAccessToken: requestMainAccessToken } : {})}
			{...(contactStorage ? { storage: contactStorage } : { onSessionChange: changeSession })}
		>
			<SystemDeviceName value={shell?.name ?? null}>
				<Localised />
			</SystemDeviceName>
		</DataProvider>
	);
}

/**
 * The language provider sits inside the data provider because the stored choice lives in the same
 * storage the data layer owns. Switching language rebuilds the i18next instance in place.
 */
function Localised() {
	const { client, storage } = useData();
	const signedIn = useSessionStore((state) => state.status === "signed-in");
	const personId = useMe({ enabled: signedIn }).data?.member.id;
	const device = useDeviceInfo(storage, BUILD_VERSION);
	const registration = useDeviceRegistration(isContactWindow() ? null : device);
	const { locale } = useLocalePreference();
	useTheme();
	const i18n = useMemo(() => createI18n(locale as Locale), [locale]);
	useRealtimeSync();
	useEffect(() => {
		let stop: (() => void) | undefined;
		let cancelled = false;
		void serveContactWindowSession(client).then((unlisten) => {
			if (cancelled) unlisten();
			else stop = unlisten;
		});
		return () => {
			cancelled = true;
			stop?.();
		};
	}, [client]);

	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);

	return (
		<I18nextProvider i18n={i18n}>
			<AppNoticeProvider scope={signedIn ? personId : undefined}>
				{signedIn && personId && !isContactWindow() ? <ConnectorContinuationNotices key={personId} /> : null}
				{registration.isSuccess && isNativeMobileNotifications() ? <NativePushRegistration /> : null}
				{registration.isSuccess && signedIn && !isNativeMobileNotifications() ? <WebPushRegistration /> : null}
				{localFilesSupported() ? <DeviceModelRuntime /> : null}
				{localFilesSupported() ? <DeviceModelWireRuntime /> : null}
				{localFilesSupported() || appleResourcesSupported() ? (
					<LocalFilesRuntime files={localFilesSupported()} apple={appleResourcesSupported()} />
				) : null}
				{providerRelaySupported() ? <ProviderRelayRuntime /> : null}
				<UpdateProvider>
					<UpdateOfferProvider
						owner={signedIn && registration.isSuccess && !isContactWindow() ? personId : undefined}
						devicePlatform={device.platform}
					>
						<MacPermissionsGate
							account={signedIn && device.platform === "macos" ? personId : undefined}
							storage={storage}
						>
							<AppRouter />
						</MacPermissionsGate>
					</UpdateOfferProvider>
				</UpdateProvider>
			</AppNoticeProvider>
		</I18nextProvider>
	);
}

async function changeSession() {
	await Promise.all([closeContactWindow(), resetLocalFiles(), resetMeetingRecorder()]);
}

function BootSplash() {
	return (
		<div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg-base)]">
			<span
				role="status"
				aria-label="loading"
				className="size-6 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-[var(--color-accent)]"
			/>
		</div>
	);
}
