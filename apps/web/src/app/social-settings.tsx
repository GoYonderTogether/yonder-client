import { memberFailureText } from "@yonder/feature-members";
import { Button, Field, FormFooter, TextArea } from "@yonder/ui-components";
import { useSaveSocialPersona, useSocialPersona } from "@yonder/ui-data";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";

interface EditorProps {
	label: string;
	value: string;
	hint?: string;
	onSaved?: (() => void) | undefined;
	onDirtyChange?: ((dirty: boolean) => void) | undefined;
	onSave: (value: string, onSaved: () => void) => void;
	busy: boolean;
	pending: boolean;
	saved: boolean;
	error: string;
}

function SocialEditor({
	label,
	value,
	hint,
	onSaved,
	onDirtyChange,
	onSave,
	busy,
	pending,
	saved,
	error,
}: EditorProps) {
	const { t } = useTranslation();
	const id = useId();
	const [edit, setEdit] = useState<string | null>(null);
	const changed = edit !== null && edit !== value;
	useEffect(() => {
		onDirtyChange?.(changed);
	}, [changed, onDirtyChange]);
	return (
		<form
			className="flex flex-col gap-[var(--spacing-6)]"
			onSubmit={(event) => {
				event.preventDefault();
				if (changed && !busy)
					onSave(edit, () => {
						setEdit(null);
						onDirtyChange?.(false);
						onSaved?.();
					});
			}}
		>
			<Field htmlFor={id} label={label} hint={hint} error={error || undefined}>
				<TextArea
					id={id}
					aria-describedby={hint || error ? `${id}-hint` : undefined}
					invalid={Boolean(error)}
					rows={6}
					maxLength={20000}
					value={edit ?? value}
					onChange={(event) => setEdit(event.target.value)}
					disabled={pending}
				/>
			</Field>
			{saved && edit === null ? (
				<p role="status" className="text-caption text-[var(--color-text-secondary)]">
					{t("members.social.saved")}
				</p>
			) : null}
			<FormFooter>
				<Button variant="primary" type="submit" loading={pending} disabled={!changed || busy}>
					{t("app.save")}
				</Button>
			</FormFooter>
		</form>
	);
}

function SocialLoadFailure({ error, retry }: { error: unknown; retry: () => void }) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-wrap items-center gap-[var(--spacing-3)]">
			<p role="alert" className="text-caption text-[var(--color-danger)]">
				{memberFailureText(error, t) || t("app.loadFailed")}
			</p>
			<Button variant="link" size="sm" onClick={retry}>
				{t("app.retry")}
			</Button>
		</div>
	);
}

interface EditNavigation {
	onSaved?: () => void;
}

export function SocialPersona({
	botId,
	onSaved,
	onDirtyChange,
}: EditNavigation & { botId: string; onDirtyChange?: ((dirty: boolean) => void) | undefined }) {
	const { t } = useTranslation();
	const query = useSocialPersona(botId);
	const save = useSaveSocialPersona(botId);
	if (query.isLoading) return <p role="status">{t("app.loading")}</p>;
	if (!query.data) return <SocialLoadFailure error={query.error} retry={() => void query.refetch()} />;

	return (
		<SocialEditor
			key={botId}
			label={t("members.social.persona")}
			value={query.data.content}
			hint={t("members.social.personaHint")}
			onSaved={onSaved}
			onDirtyChange={onDirtyChange}
			onSave={(content, onSuccess) => save.mutate(content, { onSuccess })}
			busy={save.isPending}
			pending={save.isPending}
			saved={save.isSuccess}
			error={memberFailureText(save.error, t)}
		/>
	);
}
