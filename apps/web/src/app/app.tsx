import {
	DataProvider,
	useData,
	useDeviceRegistration,
	useLocalePreference,
	useRealtimeSync,
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
import { deviceInfo } from "../lib/device-info.ts";
import type { KeychainStorage } from "../lib/keychain.ts";
import { createKeychainStorage, isTauri } from "../lib/keychain.ts";
import { localFilesSupported, resetLocalFiles } from "../lib/local-files.ts";
import { LocalFilesRuntime } from "../lib/local-files-runtime.tsx";
import { resetMeetingRecorder } from "../lib/meeting-recorder.ts";
import { UpdateProvider } from "../updates/provider.tsx";
import { AppRouter } from "./router.tsx";

/**
 * Assembly only: providers, then the router. This file may import every layer; nothing else in the
 * app does more than pick a page.
 */
export function App() {
	const contactStorage = useMemo(() => (isContactWindow() ? createContactStorage() : undefined), []);
	// In a shell, the refresh token comes from the OS keychain; the read is async, so the providers
	// wait for it rather than starting a session-less boot.
	const [keychain, setKeychain] = useState<KeychainStorage | null>(null);
	const [ready, setReady] = useState(!isTauri() || isContactWindow());

	useEffect(() => {
		if (!isTauri() || isContactWindow()) return;
		let cancelled = false;
		void createKeychainStorage().then(async (storage) => {
			await storage.ready;
			if (cancelled) return;
			setKeychain(storage);
			setReady(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	if (!ready) return <BootSplash />;

	return (
		<DataProvider
			baseUrl={apiBaseUrl({ shell: isTauri(), dev: import.meta.env.DEV })}
			appVersion={BUILD_VERSION}
			clientKind={isTauri() ? "shell" : "web"}
			{...(keychain ? { refreshTokenStorage: keychain } : {})}
			{...(isContactWindow() ? { refreshAccessToken: requestMainAccessToken } : {})}
			{...(contactStorage ? { storage: contactStorage } : { onSessionChange: changeSession })}
		>
			<Localised />
		</DataProvider>
	);
}

/**
 * The language provider sits inside the data provider because the stored choice lives in the same
 * storage the data layer owns. Switching language rebuilds the i18next instance in place.
 */
function Localised() {
	const { client, storage } = useData();
	const device = useMemo(() => deviceInfo(storage, BUILD_VERSION), [storage]);
	useDeviceRegistration(isContactWindow() ? null : device);
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
			{localFilesSupported() ? <LocalFilesRuntime /> : null}
			<UpdateProvider>
				<AppRouter />
			</UpdateProvider>
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
