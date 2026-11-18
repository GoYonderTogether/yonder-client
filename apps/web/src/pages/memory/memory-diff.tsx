import { useTranslation } from "react-i18next";
import "./memory-files.css";

/** Compare the changed span and omit the shared prefix and suffix. */
export function MemoryDiff({ before, after }: { before: string; after: string }) {
	const { t } = useTranslation();
	if (before === after) return <p className="text-caption">{t("memory.noContentChange")}</p>;
	const older = before.split("\n");
	const newer = after.split("\n");
	const sharedLength = Math.min(older.length, newer.length);
	let start = 0;
	while (start < sharedLength && older[start] === newer[start]) start += 1;
	let end = 0;
	while (end < sharedLength - start && older.at(-1 - end) === newer.at(-1 - end)) end += 1;
	// ponytail: compare a single changed span. Use a line diff if files often have distant edits.
	return (
		<div className="memory-diff">
			<div>
				<h4>{t("memory.before")}</h4>
				<pre className="memory-diff-before">{older.slice(start, older.length - end).join("\n") || "\u00a0"}</pre>
			</div>
			<div>
				<h4>{t("memory.after")}</h4>
				<pre className="memory-diff-after">{newer.slice(start, newer.length - end).join("\n") || "\u00a0"}</pre>
			</div>
		</div>
	);
}
