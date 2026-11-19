import type { PrivacySettings } from "@yonder/protocol";
import { ListGroup, ListSwitch } from "@yonder/ui-components";
import { usePrivacy, useUpdatePrivacy } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { memberFailureText } from "../profile/failure.ts";

const SWITCHES = ["searchable", "cardForUsers", "cardPublicLink"] as const;
type SwitchId = (typeof SWITCHES)[number];

/**
 * The three switches of 19 第四节 and nothing else. Each one saves on its own: the switch moves as
 * soon as it is touched and the whole settings object replaces the cache; if the save fails the
 * switch goes back and the row says why, so it never shows a state the server does not have.
 */
export function PrivacySwitches() {
	const { t } = useTranslation();
	const settings = usePrivacy();
	const update = useUpdatePrivacy();
	const [pending, setPending] = useState<SwitchId | null>(null);
	const [draft, setDraft] = useState<Partial<PrivacySettings>>({});
	const [error, setError] = useState<string | null>(null);

	if (settings.isLoading) {
		return (
			<p
				role="status"
				className="px-[var(--spacing-4)] py-[var(--spacing-3)] text-caption text-[var(--color-text-tertiary)]"
			>
				{t("app.loading")}
			</p>
		);
	}
	if (!settings.data) {
		return (
			<div className="flex flex-col gap-[var(--spacing-2)] px-[var(--spacing-4)] py-[var(--spacing-3)]">
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{memberFailureText(settings.error, t)}
				</p>
				<button
					type="button"
					onClick={() => void settings.refetch()}
					className="self-start rounded-[var(--radius-sm)] text-caption text-[var(--color-accent-text)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
				>
					{t("app.retry")}
				</button>
			</div>
		);
	}

	const save = (key: SwitchId, value: boolean) => {
		setError(null);
		setPending(key);
		setDraft((current) => ({ ...current, [key]: value }));
		// Either answer settles this switch: the cache already holds the server's object on success,
		// and on failure dropping the draft is what puts the switch back.
		const settle = () => {
			setDraft(({ [key]: _dropped, ...rest }) => rest as Partial<PrivacySettings>);
			setPending(null);
		};
		update.mutate({ [key]: value } as Partial<PrivacySettings>, {
			onSuccess: settle,
			onError: (failure) => {
				const reason = memberFailureText(failure, t);
				if (reason) setError(reason);
				settle();
			},
		});
	};

	return (
		<ListGroup>
			{SWITCHES.map((key) => (
				<ListSwitch
					key={key}
					title={t(`members.privacy.${key}`)}
					checked={draft[key] ?? settings.data[key]}
					busy={pending === key}
					onChange={(value) => save(key, value)}
				/>
			))}
			{error ? (
				<li
					role="alert"
					className="px-[var(--spacing-1)] pt-[var(--spacing-2)] text-caption text-[var(--color-danger)]"
				>
					{error}
				</li>
			) : null}
		</ListGroup>
	);
}
