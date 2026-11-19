import type { Member } from "@yonder/protocol";
import { Button, cn, FormFooter, FormSection, IconButton, TextField } from "@yonder/ui-components";
import { useContactActions, useUpdateBot, useUploadBotAvatar } from "@yonder/ui-data";
import { Check, Plus, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
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
	/**
	 * A dedicated settings page: the form is drawn in sections with one save button, and leaving
	 * the page (back) is how the user cancels (docs/settings-forms.md).
	 */
	settings?: boolean;
	onDirtyChange?: ((dirty: boolean) => void) | undefined;
}

const NICKNAME_LIMIT = 5;
const NO_NICKNAMES: string[] = [];

/** The setup, chat and settings flows share the same Bot profile fields and mutations. */
export function BotForm({ mode, bot, onCreated, onSaved, settings: settingsPage, onDirtyChange }: BotFormProps) {
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
	const [nicknameEdit, setNicknameEdit] = useState<{ nicknames: string[]; selectedNickname: string | null } | null>(
		null,
	);
	const [newNickname, setNewNickname] = useState("");

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
	const storedNicknames = bot?.nicknames ?? NO_NICKNAMES;
	const nicknames = nicknameEdit?.nicknames ?? storedNicknames;
	const selectedNickname = nicknameEdit ? nicknameEdit.selectedNickname : (bot?.selectedNickname ?? null);
	const nickname = newNickname.trim();
	const nicknameError =
		nickname && [...nickname].length > BOT_NAME_MAX
			? t("bots.nameTooLong")
			: nickname && nicknames.includes(nickname)
				? t("bots.nicknameDuplicate")
				: null;
	const canAddNickname = Boolean(nickname && !nicknameError && nicknames.length < NICKNAME_LIMIT);
	const settings = mode === "edit" && Boolean(settingsPage);
	const renamed = trimmed !== bot?.displayName;
	const recoloured = color !== botColor(bot);
	const savedNicknames = canAddNickname ? [...nicknames, nickname] : nicknames;
	const nicknamesChanged =
		JSON.stringify(savedNicknames) !== JSON.stringify(storedNicknames) ||
		selectedNickname !== (bot?.selectedNickname ?? null);
	const changed = renamed || recoloured || nicknamesChanged || Boolean(file) || Boolean(bot?.avatarUrl && cleared);
	useEffect(() => {
		onDirtyChange?.(changed || Boolean(nickname));
	}, [changed, nickname, onDirtyChange]);
	const shuffle = () => setName(randomBotName(i18n.resolvedLanguage ?? "en"));

	function addNickname() {
		if (!canAddNickname) return;
		setNicknameEdit({ nicknames: [...nicknames, nickname], selectedNickname });
		setNewNickname("");
	}

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
		if (saving || (settings && !changed)) return;
		if (!valid) {
			setError(tooLong ? t("bots.nameTooLong") : t("bots.nameRequired"));
			return;
		}
		if (nicknameError) return;
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
			// One call changes one appearance: the server refuses a colour together with "remove the
			// image", so the picture is cleared first and the colour set after it.
			if (bot.avatarUrl && (cleared || recoloured)) await update.mutateAsync({ id: bot.id, clearAvatar: true });
			if (renamed || recoloured || nicknamesChanged)
				await update.mutateAsync({
					id: bot.id,
					...(renamed ? { displayName: trimmed } : {}),
					...(recoloured ? { avatarColor: color } : {}),
					...(nicknamesChanged ? { nicknames: savedNicknames, selectedNickname } : {}),
				});
			setNicknameEdit(null);
			setNewNickname("");
			if (file) {
				step = "upload";
				await upload.mutateAsync({ id: bot.id, file });
			}
			onDirtyChange?.(false);
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
			className={cn(
				"flex flex-col",
				settings ? "gap-[var(--spacing-4)]" : "gap-[var(--spacing-6)] p-[var(--spacing-6)]",
			)}
			onSubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<Section title={settings ? t("bots.avatarSection") : null}>
				<BotAvatarPicker
					name={trimmed}
					color={color}
					avatarUrl={shown}
					onColor={pickColor}
					onFile={chooseFile}
					onClear={removePicture}
					uploading={saving && Boolean(file)}
					align={settings ? "start" : "center"}
					disabled={settings && saving}
					{...(mode === "create" ? { onShuffle: shuffle } : {})}
				/>
			</Section>
			<Section title={settings ? t("bots.nameSection") : null}>
				<TextField
					label={t("bots.name")}
					value={name}
					onChange={(event) => setName(event.target.value)}
					maxLength={BOT_NAME_MAX}
					placeholder={t("bots.namePlaceholder")}
					required
					disabled={settings && saving}
					{...(tooLong ? { error: t("bots.nameTooLong") } : {})}
				/>
				{mode === "edit" ? (
					<div className="flex flex-col gap-[var(--spacing-2)]">
						<TextField
							label={t("bots.nicknames")}
							value={newNickname}
							onChange={(event) => setNewNickname(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.nativeEvent.isComposing) {
									event.preventDefault();
									addNickname();
								}
							}}
							disabled={saving || nicknames.length >= NICKNAME_LIMIT}
							error={nicknameError}
							trailing={
								<IconButton
									type="button"
									size="sm"
									aria-label={t("bots.addNickname")}
									disabled={saving || !canAddNickname}
									onClick={addNickname}
								>
									<Plus size={16} aria-hidden="true" />
								</IconButton>
							}
						/>
						{nicknames.length ? (
							<div className="flex flex-wrap items-center gap-[var(--spacing-2)]">
								{nicknames.map((value) => (
									<div
										key={value}
										className={cn(
											"flex min-w-0 max-w-full items-stretch rounded-full text-body text-[var(--color-text-primary)]",
											value === selectedNickname ? "bg-[var(--color-bg-selected)]" : "bg-[var(--color-bg-subtle)]",
										)}
									>
										<button
											type="button"
											aria-label={value}
											aria-pressed={value === selectedNickname}
											disabled={saving}
											className="flex min-w-0 items-center gap-[var(--spacing-1)] rounded-full ps-[var(--spacing-3)] pe-[var(--spacing-1)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
											onClick={() => setNicknameEdit({ nicknames, selectedNickname: value })}
										>
											{value === selectedNickname ? <Check size={15} className="shrink-0" aria-hidden="true" /> : null}
											<span className="truncate">{value}</span>
										</button>
										<IconButton
											type="button"
											size="sm"
											aria-label={t("bots.removeNickname", { name: value })}
											disabled={saving}
											onClick={() =>
												setNicknameEdit({
													nicknames: nicknames.filter((item) => item !== value),
													selectedNickname: value === selectedNickname ? null : selectedNickname,
												})
											}
										>
											<X size={15} aria-hidden="true" />
										</IconButton>
									</div>
								))}
								<Button
									type="button"
									size="sm"
									variant="ghost"
									aria-pressed={selectedNickname === null}
									disabled={saving}
									onClick={() => setNicknameEdit({ nicknames, selectedNickname: null })}
								>
									{t("bots.useFullName")}
								</Button>
							</div>
						) : null}
					</div>
				) : null}
			</Section>
			{error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
			{settings ? (
				<FormFooter>
					<Button
						type="submit"
						variant="primary"
						loading={saving}
						disabled={!valid || Boolean(nicknameError) || !changed}
					>
						{t("bots.saveProfile")}
					</Button>
				</FormFooter>
			) : (
				<Button type="submit" variant="primary" block loading={saving} disabled={!valid || Boolean(nicknameError)}>
					{t(mode === "create" ? "bots.create" : "bots.save")}
				</Button>
			)}
		</form>
	);
}

/** A titled section on the settings page; the create and setup flows draw the same fields untitled. */
function Section({ title, children }: { title: string | null; children: ReactNode }) {
	return title ? (
		<FormSection title={title}>{children}</FormSection>
	) : (
		<div className="flex flex-col gap-[var(--spacing-6)]">{children}</div>
	);
}
