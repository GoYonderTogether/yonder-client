import { Brain, ListChecks } from "lucide-react";
import { type CSSProperties, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useScrollProgress } from "./use-landing-motion.ts";

const WORDS = ["a", "b", "c", "d", "e", "f"] as const;

/**
 * One sentence that lights up word by word as you scroll, with two fragments of the product
 * (a memory, a task) drifting past it at their own depths.
 */
export function StorySection() {
	const { t } = useTranslation();
	const track = useRef<HTMLElement>(null);
	useScrollProgress(track);

	return (
		<section ref={track} className="lp-story" aria-label={t("landingPage.story.label")}>
			<div className="lp-story-pin">
				<div className="lp-container lp-story-inner">
					<p className="lp-story-text">
						{WORDS.map((word, index) => (
							<span key={word} className="lp-word" style={{ "--i": index } as CSSProperties}>
								{t(`landingPage.story.${word}`)}
							</span>
						))}
					</p>
					<figure className="lp-frag lp-frag-memory" aria-hidden="true">
						<span className="lp-frag-icon">
							<Brain size={18} />
						</span>
						<span className="lp-frag-text">
							<span className="lp-frag-label">{t("landingPage.story.memoryLabel")}</span>
							{t("landingPage.story.memoryText")}
						</span>
					</figure>
					<figure className="lp-frag lp-frag-task" aria-hidden="true">
						<span className="lp-frag-icon">
							<ListChecks size={18} />
						</span>
						<span className="lp-frag-text">
							<span className="lp-frag-label">{t("landingPage.story.taskLabel")}</span>
							{t("landingPage.story.taskText")}
							<span className="lp-frag-bar">
								<span />
							</span>
						</span>
					</figure>
				</div>
			</div>
		</section>
	);
}
