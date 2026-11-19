import { IconButton } from "@yonder/ui-components";
import { Bot, ContactRound, FileAudio, Plus, ScanLine, UserPlus, Users } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type ChatAction = "createBot" | "addContact" | "createGroup" | "scan" | "recordMeeting" | "contacts";
const ICONS = {
	contacts: ContactRound,
	createBot: Bot,
	addContact: UserPlus,
	createGroup: Users,
	scan: ScanLine,
	recordMeeting: FileAudio,
};

export function ChatMenu({
	mobile,
	onSelect,
	meetings = false,
}: {
	mobile: boolean;
	onSelect: (action: ChatAction) => void;
	meetings?: boolean;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const buttons = useRef<(HTMLButtonElement | null)[]>([]);
	const id = useId();
	const actions: ChatAction[] = mobile
		? ["scan", "createBot", "addContact", "createGroup", "contacts"]
		: ["createBot", "addContact", "createGroup"];
	if (meetings) actions.push("recordMeeting");
	useEffect(() => {
		if (!open) return;
		const dismiss = (event: Event) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", dismiss);
		document.addEventListener("focusin", dismiss);
		return () => {
			document.removeEventListener("pointerdown", dismiss);
			document.removeEventListener("focusin", dismiss);
		};
	}, [open]);
	useEffect(() => {
		if (open) buttons.current[active]?.focus();
	}, [open, active]);
	return (
		<div ref={root} className="relative">
			<IconButton
				ref={trigger}
				size="sm"
				aria-label={t("chatActions.menu")}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? id : undefined}
				onClick={() => {
					setActive(0);
					setOpen(!open);
				}}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown") {
						event.preventDefault();
						setActive(0);
						setOpen(true);
					}
				}}
			>
				<Plus size={20} aria-hidden="true" />
			</IconButton>
			{open ? (
				<div
					id={id}
					role="menu"
					aria-label={t("chatActions.menu")}
					className="absolute right-0 top-full z-50 mt-[var(--spacing-2)] min-w-max rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] p-[var(--spacing-1)] shadow-[var(--shadow-lg)]"
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							event.stopPropagation();
							setOpen(false);
							trigger.current?.focus();
						} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
							event.preventDefault();
							setActive((active + (event.key === "ArrowDown" ? 1 : actions.length - 1)) % actions.length);
						} else if (event.key === "Home" || event.key === "End") {
							event.preventDefault();
							setActive(event.key === "Home" ? 0 : actions.length - 1);
						}
					}}
				>
					{actions.map((action, index) => {
						const Icon = ICONS[action];
						return (
							<button
								key={action}
								ref={(element) => {
									buttons.current[index] = element;
								}}
								type="button"
								role="menuitem"
								tabIndex={index === active ? 0 : -1}
								onFocus={() => setActive(index)}
								onClick={() => {
									setOpen(false);
									trigger.current?.focus();
									onSelect(action);
								}}
								className="flex w-full items-center gap-[var(--spacing-3)] rounded-[var(--radius-control-sm)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-left text-body text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] focus-visible:bg-[var(--color-bg-hover)]"
							>
								<Icon size={18} aria-hidden="true" />
								<span>{t(`chatActions.${action}`)}</span>
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
