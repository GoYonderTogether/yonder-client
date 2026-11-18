import type { Member } from "@yonder/protocol";
import { Button, TextField } from "@yonder/ui-components";
import { useContactActions, useUpdateBot, useUploadBotAvatar } from "@yonder/ui-data";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BotAvatarPicker, botColor } from "./bot-avatar-picker.tsx";
import { BOT_NAME_MAX, randomBotName } from "./bot-defaults.ts";
import { describeBotError } from "./bot-error.ts";

export interface BotFormProps {
	/** `create` names a new Bot and opens its chat; `edit` changes an existing one in place. */
	mode: "create" | "edit";
	/** The Bot being edited; required in edit mode. */
	bot?: Member | undefined;
	onCreated?: (conversationId: string) => void;
	onSaved?: () => void;
}

/**
 * One form for both halves of a Bot's life (15 第三节): the same name field, colour swatches and
 * picture in「新建」and in「Bot 详情」. The shuffled name is only a starting point, so it is offered
 * when the Bot does not exist yet; renaming something that already has a name is the user's call.
 */
export function BotForm({ mode, bot, onCreated, onSaved }: BotFormProps) {
	const { t, i18n } = useTranslation();
	const { createBot } = useContactActions();
	const update = useUpdateBot();
	const upload = useUploadBotAvatar();

	const [name, setName] = useState(() =>
		mode === "create" ? randomBotName(i18n.resolvedLanguage ?? "en") : (bot?.displayName ?? ""),
	);
	const [color, setColor] = useState(() => botColor(mode === "create" ? undefined : bot));
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [cleared, setCleared] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	// Another tab renamed the same Bot while this form was open; the field follows the server.
	const storedName = bot?.displayName;
	useEffect(() => {
		if (mode === "edit" && storedName) setName(storedName);
	}, [mode, storedName]);

	useEffect(
		() => () => {
			if (preview) URL.revokeObjectURL(preview);
		},
		[preview],
	);

	const trimmed = name.trim();
	const tooLong = [...trimmed].length > BOT_NAME_MAX;
	const valid = trimmed.length > 0 && !tooLong;
	const shuffle = () => setName(randomBotName(i18n.resolvedLanguage ?? "en"));

	const chooseFile = (chosen: File) => {
		if (preview) URL.revokeObjectURL(preview);
		setFile(chosen);
		setPreview(URL.createObjectURL(chosen));
		setCleared(false);
	};

	const removePicture = () => {
		if (preview) URL.revokeObjectURL(preview);
		setFile(null);
		setPreview(null);
		setCleared(true);
	};

	const pickColor = (value: string) => {
		setColor(value);
		// A colour is drawn only where there is no picture, so picking one is how you go back to it.
		if (mode === "edit" && bot?.avatarUrl && !file) setCleared(true);
	};

	async function submit() {
		if (!valid) {
			setError(tooLong ? t("bots.nameTooLong") : t("bots.nameRequired"));
			return;
		}
		setError(null);
		setSaving(true);
		let step: "save" | "upload" = "save";
		try {
			if (mode === "create") {
				const created = await createBot.mutateAsync({ displayName: trimmed, avatarColor: color });
				if (file) {
					step = "upload";
					await upload.mutateAsync({ id: created.bot.id, file });
				}
				onCreated?.(created.conversation.id);
				return;
			}
			if (!bot) return;
			const renamed = trimmed !== bot.displayName;
			const recoloured = color !== botColor(bot);
			// One call changes one appearance: the server refuses a colour together with "remove the
			// image", so the picture is cleared first and the colour set after it.
			if (bot.avatarUrl && (cleared || recoloured)) await update.mutateAsync({ id: bot.id, clearAvatar: true });
			if (renamed || recoloured)
				await update.mutateAsync({
					id: bot.id,
					...(renamed ? { displayName: trimmed } : {}),
					...(recoloured ? { avatarColor: color } : {}),
				});
			if (file) {
				step = "upload";
				await upload.mutateAsync({ id: bot.id, file });
			}
			onSaved?.();
		} catch (failure) {
			const fallback =
				step === "upload" ? "bots.uploadFailed" : mode === "create" ? "bots.createFailed" : "bots.saveFailed";
			setError(describeBotError(failure, t, fallback));
		} finally {
			setSaving(false);
		}
	}

	const shown = file ? preview : cleared ? null : (bot?.avatarUrl ?? null);

	return (
		<form
			className="flex flex-col gap-[var(--spacing-6)] p-[var(--spacing-6)]"
			onSubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<BotAvatarPicker
				name={trimmed}
				color={color}
				avatarUrl={shown}
				onColor={pickColor}
				onFile={chooseFile}
				onClear={removePicture}
				uploading={saving && Boolean(file)}
				{...(mode === "create" ? { onShuffle: shuffle } : {})}
			/>
			<TextField
				label={t("bots.name")}
				value={name}
				onChange={(event) => setName(event.target.value)}
				maxLength={BOT_NAME_MAX}
				placeholder={t("bots.namePlaceholder")}
				required
				{...(tooLong ? { error: t("bots.nameTooLong") } : {})}
			/>
			{error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
			<Button type="submit" variant="primary" block loading={saving} disabled={!valid}>
				{mode === "create" ? t("bots.create") : t("bots.save")}
			</Button>
		</form>
	);
}
