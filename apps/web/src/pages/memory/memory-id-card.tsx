import { Avatar, Logo } from "@yonder/ui-components";
import { useMemoryFile, usePerson } from "@yonder/ui-data";
import { ChevronRight, LockKeyhole, QrCode, RotateCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ABOUT_PATHS, useOpenMemoryFile } from "./memory-navigation.ts";
import { MemoryShareSheet } from "./memory-share.tsx";
import "./memory-id-card.css";

const FACETS: Record<(typeof ABOUT_PATHS)[number], string> = {
	"/me/印象.md": "memory.impression",
	"/me/近期.md": "memory.recent",
};

/** The first lines of a file as plain text: headings and Markdown marks dropped. */
function preview(content: unknown): string {
	return (typeof content === "string" ? content : "")
		.replace(/^#.*$/gmu, "")
		.replace(/[*_`>#[\]()-]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function Facet({ path, onOpen }: { path: (typeof ABOUT_PATHS)[number]; onOpen: () => void }) {
	const { t } = useTranslation();
	const file = useMemoryFile(path);
	const text = preview(file.data?.content);
	return (
		<button type="button" className="memory-id-facet" onClick={onOpen}>
			<span className="memory-id-facet-title">{t(FACETS[path])}</span>
			<span className="memory-id-facet-text">
				{file.isPending ? t("app.loading") : file.error ? t("app.loadFailed") : text || t("memory.noContent")}
			</span>
			<ChevronRight size={16} aria-hidden="true" className="shrink-0" />
		</button>
	);
}

/**
 * The card at the top of the memory page (11-15 recording, R27): an ID-card-shaped face others see,
 * and on its back what the Bot knows about the owner, which only the owner sees. Tapping the face
 * turns it over; the QR control opens the share sheet. Settings live in 「我」, not here.
 */
export function MemoryIdCard({ compact = false }: { compact?: boolean }) {
	const { t } = useTranslation();
	const person = usePerson();
	const openFile = useOpenMemoryFile();
	const [back, setBack] = useState(false);
	const [sharing, setSharing] = useState(false);
	if (!person) return null;
	return (
		<section aria-label={t("memory.cardTitle")} className="memory-id" data-compact={compact || undefined}>
			<div className="memory-id-turn" data-back={back || undefined}>
				<div className="memory-id-face memory-id-front" inert={back}>
					<button
						type="button"
						className="memory-id-hit"
						aria-label={t("memory.cardFlipToBack")}
						onClick={() => setBack(true)}
					/>
					<div className="memory-id-brand">
						<Logo size={16} />
						<span>Yonder</span>
					</div>
					<div className="memory-id-who">
						<Avatar
							name={person.displayName}
							src={person.avatarUrl}
							color={person.avatarColor}
							size={compact ? 48 : 64}
						/>
						<div className="min-w-0">
							<p className="memory-id-name">{person.displayName}</p>
							<p className="memory-id-handle">@{person.handle}</p>
						</div>
					</div>
					{person.bio ? <p className="memory-id-bio">{person.bio}</p> : null}
					<RotateCw size={14} aria-hidden="true" className="memory-id-flip-mark" />
				</div>
				<div className="memory-id-face memory-id-back" inert={!back}>
					<button
						type="button"
						className="memory-id-hit"
						aria-label={t("memory.cardFlipToFront")}
						onClick={() => setBack(false)}
					/>
					<div className="memory-id-brand">
						<LockKeyhole size={14} aria-hidden="true" />
						<span>{t("memory.cardPrivate")}</span>
					</div>
					<div className="memory-id-facets">
						{ABOUT_PATHS.map((path) => (
							<Facet key={path} path={path} onOpen={() => openFile(path)} />
						))}
					</div>
				</div>
			</div>
			<button
				type="button"
				className="memory-id-qr"
				aria-label={t("memory.cardShareOpen")}
				onClick={() => setSharing(true)}
			>
				<QrCode size={18} aria-hidden="true" />
			</button>
			<MemoryShareSheet open={sharing} person={person} onClose={() => setSharing(false)} />
		</section>
	);
}
