import { Avatar, Button, IconButton, TextField } from "@yonder/ui-components";
import { useContactActions } from "@yonder/ui-data";
import { Check, Shuffle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BOT_AVATAR_COLORS, randomBotName } from "../../lib/bot-defaults.ts";
import { ActionError } from "./action-error.tsx";

export function CreateBot({ onCreated }: { onCreated: (id: string) => void }) {
	const { t, i18n } = useTranslation();
	const [name, setName] = useState(() => randomBotName(i18n.resolvedLanguage ?? "en"));
	const [color, setColor] = useState<string>(BOT_AVATAR_COLORS[0]);
	const { createBot } = useContactActions();
	return (
		<form
			className="flex flex-col gap-[var(--spacing-6)] p-[var(--spacing-6)]"
			onSubmit={(event) => {
				event.preventDefault();
				if (name.trim())
					createBot.mutate(
						{ displayName: name.trim(), avatarColor: color },
						{ onSuccess: ({ conversation }) => onCreated(conversation.id) },
					);
			}}
		>
			<div className="flex justify-center">
				<Avatar name={name} size={80} kind="bot" color={color} />
			</div>
			<fieldset aria-label={t("chatActions.avatarColor")} className="flex justify-center gap-[var(--spacing-3)]">
				{BOT_AVATAR_COLORS.map((value) => (
					<button
						key={value}
						type="button"
						aria-label={t(`chatActions.color${value}` as "chatActions.color1")}
						aria-pressed={value === color}
						onClick={() => setColor(value)}
						className="flex size-[var(--control-sm)] items-center justify-center rounded-full border-2 border-transparent aria-pressed:border-[var(--color-text-primary)]"
						style={{ backgroundColor: `var(--color-avatar-${value}-bg)`, color: `var(--color-avatar-${value}-fg)` }}
					>
						{value === color ? (
							<Check size={16} className="text-[var(--color-text-primary)]" aria-hidden="true" />
						) : null}
					</button>
				))}
			</fieldset>
			<TextField
				label={t("chatActions.name")}
				value={name}
				onChange={(event) => setName(event.target.value)}
				maxLength={40}
				required
				action={
					<IconButton
						size="sm"
						aria-label={t("chatActions.shuffleName")}
						onClick={() => setName(randomBotName(i18n.resolvedLanguage ?? "en"))}
					>
						<Shuffle size={16} aria-hidden="true" />
					</IconButton>
				}
			/>
			<ActionError error={createBot.error} />
			<Button type="submit" variant="primary" block loading={createBot.isPending} disabled={!name.trim()}>
				{t("chatActions.create")}
			</Button>
		</form>
	);
}
