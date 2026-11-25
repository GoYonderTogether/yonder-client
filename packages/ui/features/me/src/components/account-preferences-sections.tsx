/**
 * 「通用」's account settings: the zone every time is read in, and the language every screen speaks.
 *
 * Both follow the same shape (Google and Apple account settings, 2026-11-25): **Follow this device**
 * by default, or a locked value the whole account uses. A locked zone is an IANA name, because a
 * bare `+8` cannot express daylight saving; the `UTC±X` in the list is only a label, computed from
 * `Intl` for the current moment. Saving goes through `useSavePreferences`, the seam that becomes
 * `PATCH /v1/me/preferences` when the server's protocol lands; a failure shows the real reason.
 */

import { ListGroup, ListOption, ListRow, SearchInput } from "@yonder/ui-components";
import { ApiError, NetworkError, useAccountPreferences, useSavePreferences } from "@yonder/ui-data";
import type { Locale } from "@yonder/ui-i18n";
import { timeZoneChoices, timeZoneCityLabel, timeZoneFriendlyName, zoneOffsetLabel } from "@yonder/ui-time";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/** The translator, reduced to what a sentence builder needs. */
type Translate = ReturnType<typeof useTranslation>["t"];

/** Why a save did not happen, in the reader's words. Never a stand-in for an answer that came. */
function saveFailure(error: unknown, t: Translate): string {
	if (error instanceof NetworkError) return t("auth.errors.network");
	if (error instanceof ApiError) return t(error.messageKey);
	if (error instanceof Error && error.message === "unknown-time-zone") return t("common.timezone.unknownZone");
	if (error instanceof Error && error.message === "unknown-locale") return t("common.timezone.unknownZone");
	return t("common.timezone.storageRefused");
}

export function TimeZoneSection({ onOpenPicker }: { onOpenPicker: () => void }) {
	const { t } = useTranslation();
	const preferences = useAccountPreferences();
	const save = useSavePreferences();
	const offset = zoneOffsetLabel(preferences.zone);

	return (
		<ListGroup
			title={t("common.timezone.title")}
			footer={
				save.error ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{t("common.timezone.saveFailed", { reason: saveFailure(save.error, t) })}
					</p>
				) : undefined
			}
		>
			<ListOption
				name="account-timezone"
				value="auto"
				checked={preferences.timezone.mode === "auto"}
				onSelect={() => {
					save.reset();
					void save.save({ timezone: { mode: "auto", zone: null } });
				}}
				title={t("common.timezone.follow", {
					zone: timeZoneCityLabel(preferences.deviceZone, preferences.localeValue),
					offset: zoneOffsetLabel(preferences.deviceZone),
				})}
			/>
			<ListOption
				name="account-timezone"
				value="manual"
				checked={preferences.timezone.mode === "manual"}
				onSelect={() => {
					save.reset();
					onOpenPicker();
				}}
				title={t("common.timezone.manual")}
				subtitle={
					preferences.timezone.mode === "manual" && preferences.timezone.zone
						? t("common.timezone.locked", {
								name: timeZoneFriendlyName(preferences.timezone.zone, preferences.localeValue),
								offset: zoneOffsetLabel(preferences.timezone.zone),
							})
						: undefined
				}
			/>
			<span className="sr-only" aria-live="polite">
				{preferences.timezone.mode === "auto"
					? t("common.timezone.following", { zone: preferences.deviceZone, offset })
					: ""}
			</span>
		</ListGroup>
	);
}

/**
 * The readable part of the zone row: a locked zone says what it is, and a second line says what
 * this device is when the two differ — information only, no button, because switching is the row's
 * own two options.
 */
export function TimeZoneDeviceNote() {
	const { t } = useTranslation();
	const preferences = useAccountPreferences();
	if (preferences.timezone.mode !== "manual" || !preferences.timezone.zone) return null;
	if (preferences.timezone.zone === preferences.deviceZone) return null;
	return (
		<p className="px-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)]">
			{t("common.timezone.thisDevice", {
				zone: timeZoneCityLabel(preferences.deviceZone, preferences.localeValue),
				offset: zoneOffsetLabel(preferences.deviceZone),
			})}
		</p>
	);
}

/**
 * The zone picker: current device and Beijing time first as shortcuts, then every zone by UTC
 * offset (Apple's and Google's order), with a search over city and long name. Choosing a zone locks
 * it and returns to the previous page; a failed write leaves the list up and says why.
 */
export function TimeZonePicker({ onDone }: { onDone: () => void }) {
	const { t } = useTranslation();
	const preferences = useAccountPreferences();
	const save = useSavePreferences();
	const [search, setSearch] = useState("");
	const locale = preferences.localeValue;
	const choices = useMemo(() => timeZoneChoices(locale), [locale]);
	const needle = search.trim().toLowerCase();
	const filtered = useMemo(
		() =>
			needle
				? choices.filter(
						(choice) =>
							choice.city.toLowerCase().includes(needle) ||
							choice.zone.toLowerCase().includes(needle) ||
							choice.displayName.toLowerCase().includes(needle),
					)
				: choices,
		[choices, needle],
	);
	const shortcuts = useMemo(() => {
		const current = choices.find((choice) => choice.zone === preferences.deviceZone);
		const beijing = choices.find((choice) => choice.zone === "Asia/Shanghai");
		return [current, beijing].filter((choice, index, all) => choice && all.indexOf(choice) === index);
	}, [choices, preferences.deviceZone]);

	async function choose(zone: string) {
		save.reset();
		const saved = await save.save({ timezone: { mode: "manual", zone } });
		if (saved) onDone();
	}

	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			<ListGroup footer={t("common.timezone.pickerIntro")}>
				{shortcuts.map((choice) =>
					choice ? (
						<ListRow
							key={choice.zone}
							title={
								choice.zone === "Asia/Shanghai" ? t("common.timezone.beijing") : t("common.timezone.currentDevice")
							}
							subtitle={choice.city}
							trailing={choice.offsetLabel}
							selected={preferences.timezone.mode === "manual" && preferences.timezone.zone === choice.zone}
							onClick={() => void choose(choice.zone)}
						/>
					) : null,
				)}
			</ListGroup>
			<SearchInput
				value={search}
				onChange={(event) => setSearch(event.target.value)}
				placeholder={t("common.timezone.search")}
				aria-label={t("common.timezone.search")}
			/>
			{save.error ? (
				<p role="alert" className="px-[var(--spacing-2)] text-caption text-[var(--color-danger)]">
					{t("common.timezone.saveFailed", { reason: saveFailure(save.error, t) })}
				</p>
			) : null}
			{filtered.length === 0 ? (
				<p className="px-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)]">
					{t("common.timezone.noMatch")}
				</p>
			) : (
				<ListGroup>
					{filtered.map((choice) => (
						<ListOption
							key={choice.zone}
							name="account-timezone-choice"
							value={choice.zone}
							checked={preferences.timezone.mode === "manual" && preferences.timezone.zone === choice.zone}
							onSelect={() => void choose(choice.zone)}
							title={timeZoneCityLabel(choice.zone, locale)}
							subtitle={choice.displayName}
							trailing={choice.offsetLabel}
						/>
					))}
				</ListGroup>
			)}
		</div>
	);
}

/** The language row: follow this device, or lock 简体中文 / English for the account. */
export function LanguageSection() {
	const { t } = useTranslation();
	const preferences = useAccountPreferences();
	const save = useSavePreferences();
	const current = preferences.localeValue;
	const name = (locale: Locale) => (locale === "zh-CN" ? t("common.locale.zhCN") : t("common.locale.en"));

	return (
		<ListGroup
			title={t("common.language")}
			footer={
				save.error ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{t("common.languageChoice.saveFailed", { reason: saveFailure(save.error, t) })}
					</p>
				) : undefined
			}
		>
			<ListOption
				name="account-language"
				value="auto"
				checked={preferences.locale.mode === "auto"}
				onSelect={() => {
					save.reset();
					void save.save({ locale: { mode: "auto", locale: null } });
				}}
				title={t("common.languageChoice.follow", { locale: name(preferences.deviceLocale) })}
			/>
			{(["zh-CN", "en"] as const).map((locale) => (
				<ListOption
					key={locale}
					name="account-language"
					value={locale}
					checked={preferences.locale.mode === "manual" && current === locale}
					onSelect={() => {
						save.reset();
						void save.save({ locale: { mode: "manual", locale } });
					}}
					title={name(locale)}
				/>
			))}
		</ListGroup>
	);
}
