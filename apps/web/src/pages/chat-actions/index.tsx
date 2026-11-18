import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { openAddContactsWindow } from "../../lib/contact-window.ts";
import { shouldShowScanner } from "../../lib/platform.ts";
import { ContactsList } from "../contacts-list.tsx";
import { QrScanner } from "../qr-scanner.tsx";
import { AddContacts } from "./add-contacts.tsx";
import { type ChatAction, ChatMenu } from "./chat-menu.tsx";
import { CreateBot } from "./create-bot.tsx";
import { CreateGroup } from "./create-group.tsx";

export function ChatActions({
	onOpen,
	onOpenMeetings,
}: {
	onOpen: (id: string) => void;
	onOpenMeetings?: (separateSpeakers?: boolean) => void;
}) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const navigate = useNavigate();
	const [action, setAction] = useState<ChatAction | null>(null);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [windowError, setWindowError] = useState(false);

	const close = () => setOpen(false);
	const created = (id: string) => {
		close();
		onOpen(id);
	};
	async function select(next: ChatAction) {
		if (next === "recordMeeting" || next === "recordMeetingWithSpeakers") {
			onOpenMeetings?.(next === "recordMeetingWithSpeakers");
			return;
		}
		setWindowError(false);
		setQuery("");
		if (next === "addContact") {
			try {
				if (await openAddContactsWindow(t("chatActions.addContact"))) return;
			} catch {
				setWindowError(true);
			}
		}
		setAction(next);
		setOpen(true);
	}
	return (
		<>
			<ChatMenu
				mobile={shouldShowScanner()}
				meetings={Boolean(onOpenMeetings)}
				onSelect={(next) => void select(next)}
			/>
			{action ? (
				<Overlay
					open={open}
					closeLabel={t("app.close")}
					onClose={close}
					title={t(`chatActions.${action}`)}
					mode={mode}
					{...(action === "createGroup" ? { size: "wide" } : {})}
					{...(action === "addContact" ? { mobileBackLabel: t("app.back") } : {})}
				>
					{action === "contacts" ? (
						<ContactsList
							onOpen={(handle) => {
								close();
								navigate(`/@${encodeURIComponent(handle)}`);
							}}
						/>
					) : null}
					{action === "createBot" ? <CreateBot onCreated={created} /> : null}
					{action === "createGroup" ? <CreateGroup onCreated={created} onCancel={close} /> : null}
					{action === "addContact" ? (
						<>
							{windowError ? (
								<p
									role="status"
									className="px-[var(--spacing-5)] pt-[var(--spacing-5)] text-caption text-[var(--color-text-secondary)]"
								>
									{t("chatActions.windowFallback")}
								</p>
							) : null}
							<AddContacts
								initialQuery={query}
								onOpen={created}
								onScan={() => setAction("scan")}
								onInvite={() => {
									close();
									navigate("/me/invite");
								}}
							/>
						</>
					) : null}
					{action === "scan" ? (
						<QrScanner
							onResult={(value) => {
								if (value.startsWith("/i/")) {
									close();
									navigate(value);
								} else {
									setQuery(value);
									setAction("addContact");
								}
							}}
						/>
					) : null}
				</Overlay>
			) : null}
		</>
	);
}
