import { cn } from "@yonder/ui-components";
import { ArrowUp, Square } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ComposerProps {
	/** Who the message would go to; the placeholder names them. */
	recipientName: string | null;
	/** The draft lives in the frame, so it survives the composer leaving the screen (「我」, a resize). */
	draft: string;
	onDraftChange: (value: string) => void;
	onSend: () => void;
	onStop: () => void;
	streaming: boolean;
	disabled: boolean;
	disconnected: boolean;
	sendOnEnter: boolean;
}

/**
 * The one composer (11 第七节第 3 条). It is mounted once by the frame and stays mounted across tabs,
 * so what was typed survives a tab switch.
 */
export function Composer({
	recipientName,
	draft,
	onDraftChange: setDraft,
	onSend,
	onStop,
	streaming,
	disabled,
	disconnected,
	sendOnEnter,
}: ComposerProps) {
	const { t } = useTranslation();
	const placeholder = recipientName ? t("chat.composerTo", { name: recipientName }) : t("chat.composerPlaceholder");

	return (
		<div className="flex flex-col gap-[6px]">
			{disconnected ? (
				<p role="status" className="text-caption text-[var(--color-text-secondary)]">
					{t(streaming ? "chat.reconnectingReply" : "chat.reconnecting")}
				</p>
			) : null}
			<div
				className={cn(
					"flex items-end gap-[var(--spacing-1)] rounded-[22px] bg-[var(--color-bg-surface)] p-[5px]",
					"shadow-[0_0_0_1px_var(--color-border-subtle),var(--shadow-sm)]",
					"transition-shadow duration-[var(--duration-fast)] focus-within:shadow-[0_0_0_1px_var(--color-border-strong),var(--shadow-sm)]",
				)}
			>
				<textarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					aria-label={placeholder}
					placeholder={placeholder}
					rows={1}
					onKeyDown={(event) => {
						if (sendOnEnter && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
							event.preventDefault();
							if (!disabled && !streaming && draft.trim()) onSend();
						}
					}}
					className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-[7px] text-body text-[var(--color-text-primary)] outline-none [field-sizing:content] placeholder:text-[var(--color-text-tertiary)]"
				/>
				<button
					type="button"
					disabled={disconnected || (streaming ? false : disabled || !draft.trim())}
					onClick={streaming ? onStop : onSend}
					aria-label={t(streaming ? "chat.stop" : "chat.disabledSend")}
					className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] disabled:cursor-not-allowed disabled:bg-[var(--color-bg-subtle)] disabled:text-[var(--color-text-tertiary)]"
				>
					{streaming ? (
						<Square size={15} fill="currentColor" aria-hidden="true" />
					) : (
						<ArrowUp size={18} strokeWidth={2.2} aria-hidden="true" />
					)}
				</button>
			</div>
		</div>
	);
}
