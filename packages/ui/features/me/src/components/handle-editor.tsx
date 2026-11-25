import { Button, Field, TextInput } from "@yonder/ui-components";
import { useAccountTimeZone, useChangeHandle, useMe } from "@yonder/ui-data";
import { formatInstant } from "@yonder/ui-time";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Translate } from "./account-failure.ts";
import { describeAccountFailure } from "./account-failure.ts";

/**
 * The public handle, in 账号与安全. The first change has no waiting time and later ones wait 30
 * days; the server owns that rule and answers it in `handleChange`, so the form only shows what the
 * server says is allowed and never counts days itself.
 */
export function HandleEditor() {
	const { t, i18n } = useTranslation();
	const zone = useAccountTimeZone();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const dateInZone = (iso: string | null | undefined) =>
		iso ? formatInstant(iso, { zone, locale, style: "date", width: "short" }) : "";
	const me = useMe();
	const change = useChangeHandle();
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState<string | null>(null);

	const handleChange = me.data?.handleChange;
	const current = me.data?.member.handle ?? "";

	if (!editing) {
		return (
			<div className="flex flex-col gap-[var(--spacing-2)]">
				<div className="flex items-center justify-between gap-[var(--spacing-3)]">
					<div className="flex flex-col">
						<span className="text-body text-[var(--color-text-primary)]">{t("me.handle.title")}</span>
						<span className="tabular-nums text-caption text-[var(--color-text-secondary)]">@{current}</span>
					</div>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						disabled={!handleChange?.canChange}
						onClick={() => {
							setValue(current);
							setError(null);
							setSaved(null);
							setEditing(true);
						}}
					>
						{t("me.handle.change")}
					</Button>
				</div>
				{handleChange && !handleChange.canChange ? (
					<p className="text-caption text-[var(--color-text-tertiary)]">
						{t("me.handle.nextChange", { date: dateInZone(handleChange.nextChangeAt) })}
					</p>
				) : null}
				{saved ? <p className="text-caption text-[var(--color-text-tertiary)]">{saved}</p> : null}
			</div>
		);
	}

	return (
		<form
			className="flex flex-col gap-[var(--spacing-3)]"
			onSubmit={(event) => {
				event.preventDefault();
				setError(null);
				change.mutate(value.trim().toLowerCase(), {
					onSuccess: (result) => {
						setEditing(false);
						setSaved(
							t("me.handle.saved", {
								handle: result.me.member.handle,
								old: result.oldHandle,
								date: dateInZone(result.oldHandleRedirectUntil),
							}),
						);
					},
					onError: (failure) =>
						setError(describeAccountFailure(failure, t as unknown as Translate, { locale, zone }).text),
				});
			}}
		>
			<Field label={t("me.handle.label")} htmlFor="new-handle" hint={t("me.handle.hint")} error={error ?? undefined}>
				<TextInput
					id="new-handle"
					value={value}
					onChange={(event) => setValue(event.target.value)}
					placeholder={t("me.handle.placeholder")}
					autoComplete="off"
					autoCapitalize="none"
					spellCheck={false}
					invalid={Boolean(error)}
				/>
			</Field>
			<div className="flex gap-[var(--spacing-2)]">
				<Button type="button" variant="secondary" onClick={() => setEditing(false)}>
					{t("app.cancel")}
				</Button>
				<Button type="submit" loading={change.isPending} disabled={value.trim() === "" || value.trim() === current}>
					{t("me.handle.save")}
				</Button>
			</div>
		</form>
	);
}
