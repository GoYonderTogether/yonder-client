import type { Attachment } from "@yonder/protocol";
import { ICON_SIZE, ICON_STROKE } from "@yonder/ui-tokens";
import { Check, ChevronRight, MessageCircleQuestionMark } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ensureDisplayBlob } from "../lib/image-display.ts";
import { useObjectUrl } from "../lib/use-object-url.ts";
import { useAttachmentBlob } from "../preview/use-attachment-blob.ts";
import { MessageContent } from "./message-content.tsx";

function OptionImage({ file }: { file: Attachment }) {
	const { t } = useTranslation();
	const slot = useRef<HTMLSpanElement>(null);
	const { blob, error, load } = useAttachmentBlob(file);
	const [image, setImage] = useState<{ original: Blob; display: Blob | null }>();
	const url = useObjectUrl(blob && image?.original === blob ? (image.display ?? undefined) : undefined);
	useEffect(() => {
		if (!slot.current) return;
		const observer = new IntersectionObserver((entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			observer.disconnect();
			void load();
		});
		observer.observe(slot.current);
		return () => observer.disconnect();
	}, [load]);
	useEffect(() => {
		if (!blob) return;
		let active = true;
		void ensureDisplayBlob(blob, file.name).then(
			(display) => {
				if (active) setImage({ original: blob, display });
			},
			() => {
				if (active) setImage({ original: blob, display: null });
			},
		);
		return () => {
			active = false;
		};
	}, [blob, file.name]);
	return (
		<span ref={slot} className="message-option-image">
			{url ? (
				<img src={url} alt={file.name} decoding="async" />
			) : (
				<span>{error || image?.display === null ? t("chat.attachmentFailed") : t("app.loading")}</span>
			)}
		</span>
	);
}

export function MessageOptions({
	question,
	summary,
	result,
	options,
	images,
	selected,
	onChoose,
}: {
	question: string | null;
	/** What the choice is about, one line under the question: what is about to be done. */
	summary?: string | undefined;
	/** What became of the choice, one line under the options: done, or why it was not. */
	result?: string | undefined;
	options: string[];
	images: (Attachment | undefined)[];
	selected?: string | null | undefined;
	onChoose?: ((body: string) => void) | undefined;
}) {
	const title = useId();
	const hasQuestion = Boolean(question?.trim());
	return (
		<section className="message-option-card" aria-labelledby={hasQuestion ? title : undefined}>
			{hasQuestion && question ? (
				<div className="message-option-card-heading">
					<div className="message-option-card-icon" aria-hidden="true">
						<MessageCircleQuestionMark size={ICON_SIZE.md} strokeWidth={ICON_STROKE.normal} />
					</div>
					<div id={title} className="message-option-card-question">
						<MessageContent body={question} />
					</div>
				</div>
			) : null}
			{summary ? <p className="message-option-card-summary">{summary}</p> : null}
			<ul className="message-option-list">
				{options.map((option, index) => {
					const file = images[index];
					const chosen = option === selected;
					const Indicator = chosen ? Check : ChevronRight;
					return (
						<li key={option}>
							<button
								type="button"
								className={`message-option-row ${chosen ? "message-option-row-chosen" : ""}`}
								aria-label={option}
								aria-current={chosen ? "true" : undefined}
								disabled={!onChoose}
								onClick={() => onChoose?.(option)}
							>
								<span className="message-option-choice">
									<span>{option}</span>
									{file ? <OptionImage key={file.id} file={file} /> : null}
								</span>
								<span className="message-option-indicator" aria-hidden="true">
									{chosen || onChoose ? (
										<Indicator size={ICON_SIZE.sm} strokeWidth={chosen ? ICON_STROKE.selected : ICON_STROKE.normal} />
									) : null}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
			{result ? (
				<p className="message-option-card-result" role="status">
					{result}
				</p>
			) : null}
		</section>
	);
}
