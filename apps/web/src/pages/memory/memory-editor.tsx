import type { MemoryFileContent } from "@yonder/protocol";
import { Button, cn, TextArea } from "@yonder/ui-components";
import { useMemoryFileActions } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MemoryError } from "./memory-status.tsx";
import { measure } from "./memory-who.ts";

/**
 * Editing a file in place. The length limit is real (23 7.5: the `/me` files go into every turn),
 * so the count is shown while typing and Save is off past it, instead of an error after saving.
 */
export function MemoryEditor({ file, onDone }: { file: MemoryFileContent; onDone: () => void }) {
	const { t, i18n } = useTranslation();
	const { update } = useMemoryFileActions();
	const [content, setContent] = useState(file.content);
	const length = measure(content, file.limit);
	const over = length > file.limit.length;
	const number = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language);
	return (
		<form
			className="flex flex-col gap-[var(--spacing-3)]"
			onSubmit={(event) => {
				event.preventDefault();
				if (over) return;
				update.mutate({ path: file.path, content, expectedVersion: file.version }, { onSuccess: onDone });
			}}
		>
			<TextArea
				aria-label={t("memory.content")}
				value={content}
				rows={10}
				invalid={over}
				disabled={update.isPending}
				autoFocus
				onChange={(event) => setContent(event.target.value)}
			/>
			<div className="flex items-center justify-between gap-[var(--spacing-3)]">
				<span
					aria-live="polite"
					className={cn(
						"text-caption tabular-nums",
						over ? "text-[var(--color-danger)]" : "text-[var(--color-text-tertiary)]",
					)}
				>
					{t("memory.length", { length: number.format(length), limit: number.format(file.limit.length) })}
				</span>
				<div className="flex gap-[var(--spacing-2)]">
					<Button size="sm" disabled={update.isPending} onClick={onDone}>
						{t("app.cancel")}
					</Button>
					<Button size="sm" type="submit" variant="primary" disabled={over} loading={update.isPending}>
						{t("app.save")}
					</Button>
				</div>
			</div>
			{update.error ? <MemoryError error={update.error} /> : null}
		</form>
	);
}
