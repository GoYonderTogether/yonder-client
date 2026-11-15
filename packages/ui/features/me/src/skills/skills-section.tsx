import { Button, Checkbox, ListGroup, SearchInput } from "@yonder/ui-components";
import { useSkillActions, useSkills } from "@yonder/ui-data";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SkillDetailView } from "./skill-detail.tsx";
import { SkillImport } from "./skill-import.tsx";

export function SkillsSection({
	page,
	onOpenPage,
}: {
	page: string | null;
	onOpenPage: (page: string | null) => void;
}) {
	if (page === "import" || page?.startsWith("replace-"))
		return (
			<SkillImport
				key={page}
				{...(page.startsWith("replace-") ? { id: page.slice(8) } : {})}
				onDone={(id) => onOpenPage(`view-${id}`)}
			/>
		);
	if (page?.startsWith("view-")) return <SkillDetailView key={page} id={page.slice(5)} onOpenPage={onOpenPage} />;
	return <SkillsList onOpenPage={onOpenPage} />;
}

function SkillsList({ onOpenPage }: { onOpenPage: (page: string) => void }) {
	const { t } = useTranslation();
	const skills = useSkills();
	const actions = useSkillActions();
	const [search, setSearch] = useState("");
	const query = search.trim().toLowerCase();
	const filtered = skills.data?.items.filter((skill) =>
		`${skill.name} ${skill.displayNameZh ?? ""} ${skill.description}`.toLowerCase().includes(query),
	);
	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			<div className="flex justify-end">
				<Button variant="primary" onClick={() => onOpenPage("import")}>
					<span className="inline-flex items-center gap-[var(--spacing-2)]">
						<Plus size={16} aria-hidden />
						{t("skills.import")}
					</span>
				</Button>
			</div>
			<SearchInput
				placeholder={t("skills.search")}
				value={search}
				onChange={(event) => setSearch(event.target.value)}
			/>
			{skills.isLoading ? <p role="status">{t("app.loading")}</p> : null}
			{skills.isError ? (
				<div role="alert">
					<p>{t("skills.loadFailed")}</p>
					<Button variant="link" onClick={() => void skills.refetch()}>
						{t("app.retry")}
					</Button>
				</div>
			) : null}
			{skills.data && !filtered?.length ? (
				<p className="text-caption text-[var(--color-text-secondary)]">
					{t(skills.data.items.length ? "skills.noMatches" : "skills.empty")}
				</p>
			) : null}
			{filtered?.length ? (
				<ListGroup>
					{filtered.map((skill) => (
						<li
							key={skill.id}
							className="flex items-center gap-[var(--spacing-3)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] last:border-0"
						>
							<button
								type="button"
								onClick={() => onOpenPage(`view-${skill.id}`)}
								className="flex min-w-0 flex-1 items-center gap-[var(--spacing-2)] rounded-[var(--radius-sm)] text-start focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
							>
								<span className="min-w-0 flex-1">
									<span className="block break-words text-body">
										{skill.name}{" "}
										{skill.displayNameZh ? (
											<span className="text-caption text-[var(--color-text-tertiary)]">{skill.displayNameZh}</span>
										) : null}
									</span>
									<span className="mt-[var(--spacing-1)] block break-words text-caption text-[var(--color-text-secondary)]">
										{skill.description}
									</span>
									<span className="mt-[var(--spacing-1)] block text-caption text-[var(--color-text-tertiary)]">
										{t(`skills.source.${skill.source}`)}
									</span>
								</span>
								<ChevronRight size={16} className="shrink-0 text-[var(--color-text-tertiary)]" aria-hidden />
							</button>
							<Checkbox
								checked={skill.enabled}
								aria-label={t("skills.enable", { name: skill.name })}
								disabled={actions.update.isPending}
								onChange={(event) => actions.update.mutate({ id: skill.id, enabled: event.target.checked })}
							/>
						</li>
					))}
				</ListGroup>
			) : null}
			{actions.update.isError ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t("skills.actionFailed")}
				</p>
			) : null}
		</div>
	);
}
