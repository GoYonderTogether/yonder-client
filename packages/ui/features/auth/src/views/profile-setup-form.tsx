import { Avatar, Button, TextField } from "@yonder/ui-components";
import { useUpdateMe, useUploadAvatar } from "@yonder/ui-data";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FailureMessage, Translate } from "../hooks/describe-failure.ts";
import { describeFailure } from "../hooks/describe-failure.ts";

export interface ProfileSetupFormProps {
	/** Called when the step finishes, whether it was filled in or skipped. */
	onDone: () => void;
	onSkip: () => void;
	/** The current name and avatar, so a returning user sees what is already set. */
	currentName: string;
	currentAvatarUrl: string | null;
	handle: string;
	/** The primary button's text; the default closes sign-up, so a flow that goes on supplies its own. */
	submitLabel?: string | undefined;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * The last optional setup step: a name and an avatar. Both are optimistic — the new avatar shows
 * from a local preview before the upload finishes, and the name saves as it is typed out of focus
 * (brief rule 4).
 */
export function ProfileSetupForm({
	onDone,
	onSkip,
	currentName,
	currentAvatarUrl,
	handle,
	submitLabel,
}: ProfileSetupFormProps) {
	const { t } = useTranslation();
	// The mutation, not the raw endpoint: it writes the new name into the query cache, so the shell
	// shows it as soon as the step finishes instead of after a refetch.
	const update = useUpdateMe();
	const upload = useUploadAvatar();
	const fileInput = useRef<HTMLInputElement>(null);

	const [name, setName] = useState(currentName === handle ? "" : currentName);
	const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl);
	const [saving, setSaving] = useState(false);
	const [failure, setFailure] = useState<FailureMessage | null>(null);

	const chooseFile = useCallback(
		async (file: File) => {
			setFailure(null);
			if (!ACCEPTED_TYPES.includes(file.type)) {
				setFailure({ text: t("profile.avatarWrongType") });
				return;
			}
			if (file.size > MAX_AVATAR_BYTES) {
				setFailure({ text: t("profile.avatarTooLarge") });
				return;
			}
			// The local preview is what makes the change feel instant; the server's address replaces
			// it when it arrives.
			setPreviewUrl(URL.createObjectURL(file));
			try {
				const me = await upload.mutateAsync(file);
				setPreviewUrl(me.member.avatarUrl);
			} catch (error) {
				setPreviewUrl(currentAvatarUrl);
				setFailure(describeFailure(error, t as unknown as Translate));
			}
		},
		[currentAvatarUrl, t, upload],
	);

	const save = useCallback(async () => {
		setFailure(null);
		setSaving(true);
		try {
			if (name.trim() !== "" && name.trim() !== currentName) {
				await update.mutateAsync({ displayName: name.trim() });
			}
			onDone();
		} catch (error) {
			setFailure(describeFailure(error, t as unknown as Translate));
		} finally {
			setSaving(false);
		}
	}, [currentName, name, onDone, t, update]);

	return (
		<form
			className="flex w-full max-w-[400px] flex-col gap-[var(--spacing-6)]"
			onSubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<h1 className="text-h1 text-[var(--color-text-primary)]">{t("auth.setupProfileTitle")}</h1>

			<div className="flex items-center gap-[var(--spacing-4)]">
				<Avatar name={name || handle} src={previewUrl} size={64} />
				<div className="flex flex-col gap-[var(--spacing-1)]">
					<Button
						type="button"
						variant="secondary"
						onClick={() => fileInput.current?.click()}
						loading={upload.isPending}
					>
						{t("profile.changeAvatar")}
					</Button>
					<span className="text-micro text-[var(--color-text-tertiary)]">{t("auth.avatarFormats")}</span>
				</div>
				<input
					ref={fileInput}
					type="file"
					accept={ACCEPTED_TYPES.join(",")}
					className="sr-only"
					aria-label={t("profile.avatar")}
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) void chooseFile(file);
						event.target.value = "";
					}}
				/>
			</div>

			<TextField
				id="setup-name"
				label={t("profile.name")}
				hint={t("auth.changeHandleHint", { handle })}
				fieldSize="lg"
				value={name}
				onChange={(event) => setName(event.target.value)}
				placeholder={t("profile.namePlaceholder")}
				maxLength={40}
				autoComplete="nickname"
			/>

			{failure ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{failure.text}
				</p>
			) : null}

			<div className="flex flex-wrap gap-[var(--spacing-2)]">
				<Button type="button" variant="ghost" size="lg" className="shrink-0 whitespace-nowrap" onClick={onSkip}>
					{t("app.skipStep")}
				</Button>
				<Button type="submit" variant="primary" size="lg" className="flex-1 whitespace-nowrap" loading={saving}>
					{submitLabel ?? t("auth.finish")}
				</Button>
			</div>
		</form>
	);
}
