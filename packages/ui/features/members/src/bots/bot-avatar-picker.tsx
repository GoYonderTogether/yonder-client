import type { Member } from "@yonder/protocol";
import { Avatar, Button, cn, IconButton } from "@yonder/ui-components";
import { Check, Shuffle } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BOT_AVATAR_COLORS, BOT_AVATAR_MAX_BYTES, BOT_AVATAR_TYPES } from "./bot-defaults.ts";

export interface BotAvatarPickerProps {
	name: string;
	color: string;
	/** The stored picture, if the Bot has one. */
	avatarUrl: string | null;
	onColor: (color: string) => void;
	onFile: (file: File) => void;
	onClear: () => void;
	/** Set while the upload runs; the picker stays usable but shows the work. */
	uploading?: boolean;
	/** A local object URL shown instead of `avatarUrl` while the upload is in flight. */
	preview?: string | null;
	error?: string | null;
	/** Create mode also offers the name-shuffling control beside the preview. */
	onShuffle?: (() => void) | undefined;
	align?: "center" | "start";
	disabled?: boolean;
}

/**
 * How a Bot looks: a colour from the six the server accepts, or an uploaded picture, which wins
 * while it exists (15 第三节). Choosing a colour does not touch the picture; clearing the picture
 * is what returns the Bot to its colour, so the two actions are separate buttons.
 */
export function BotAvatarPicker({
	name,
	color,
	avatarUrl,
	onColor,
	onFile,
	onClear,
	uploading = false,
	preview,
	error,
	onShuffle,
	align = "center",
	disabled = false,
}: BotAvatarPickerProps) {
	const { t } = useTranslation();
	const input = useRef<HTMLInputElement>(null);
	const [localError, setLocalError] = useState<string | null>(null);
	const shown = preview ?? avatarUrl;

	const choose = (file: File) => {
		if (!(BOT_AVATAR_TYPES as readonly string[]).includes(file.type)) {
			setLocalError(t("bots.avatarWrongType"));
			return;
		}
		if (file.size > BOT_AVATAR_MAX_BYTES) {
			setLocalError(t("bots.avatarTooLarge"));
			return;
		}
		setLocalError(null);
		onFile(file);
	};

	return (
		<div className={cn("flex flex-col gap-[var(--spacing-3)]", align === "start" ? "items-start" : "items-center")}>
			<div className="relative">
				<Avatar name={name} src={shown} size={80} kind="bot" color={shown ? null : color} />
				{onShuffle ? (
					<IconButton
						size="sm"
						aria-label={t("bots.shuffleName")}
						onClick={onShuffle}
						className="absolute -end-10 top-0"
					>
						<Shuffle size={16} aria-hidden="true" />
					</IconButton>
				) : null}
			</div>
			<fieldset
				aria-label={t("bots.avatarColor")}
				className={cn("flex flex-wrap", align === "start" ? "gap-[var(--spacing-2)]" : "gap-[var(--spacing-3)]")}
				disabled={disabled}
			>
				{BOT_AVATAR_COLORS.map((value) => (
					<button
						key={value}
						type="button"
						aria-label={t(`bots.color${value}` as "bots.color1")}
						aria-pressed={value === color}
						onClick={() => onColor(value)}
						className="flex size-[var(--control-sm)] items-center justify-center rounded-full border-2 border-transparent aria-pressed:border-[var(--color-text-primary)]"
						style={{ backgroundColor: `var(--color-avatar-${value}-bg)`, color: `var(--color-avatar-${value}-fg)` }}
					>
						{value === color ? (
							<Check size={16} className="text-[var(--color-text-primary)]" aria-hidden="true" />
						) : null}
					</button>
				))}
			</fieldset>
			<div className="flex flex-wrap items-center gap-[var(--spacing-2)]">
				<Button
					type="button"
					variant="link"
					onClick={() => input.current?.click()}
					loading={uploading}
					disabled={disabled}
				>
					{t("bots.changeAvatar")}
				</Button>
				{shown ? (
					<Button type="button" variant="link" onClick={onClear} disabled={disabled}>
						{t("bots.removeAvatar")}
					</Button>
				) : null}
			</div>
			<input
				ref={input}
				type="file"
				disabled={disabled}
				accept={BOT_AVATAR_TYPES.join(",")}
				className="sr-only"
				aria-label={t("bots.avatar")}
				onChange={(event) => {
					const file = event.target.files?.[0];
					if (file) choose(file);
					event.target.value = "";
				}}
			/>
			{localError || error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{localError ?? error}
				</p>
			) : null}
		</div>
	);
}

/** A Bot that has a picture but should be shown with its colour: used when it only has a name. */
export function botColor(bot: Pick<Member, "avatarColor"> | undefined): string {
	return bot?.avatarColor && /^[1-6]$/.test(bot.avatarColor) ? bot.avatarColor : BOT_AVATAR_COLORS[0];
}
