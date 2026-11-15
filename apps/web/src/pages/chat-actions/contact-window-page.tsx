import { Button } from "@yonder/ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { isContactWindow, notifyContactAdded } from "../../lib/contact-window.ts";
import { QrScanner } from "../qr-scanner.tsx";
import { AddContacts } from "./add-contacts.tsx";

export function ContactWindowPage() {
	const { t } = useTranslation();
	const [search] = useSearchParams();
	const navigate = useNavigate();
	const [scan, setScan] = useState(false);
	const [query, setQuery] = useState(search.get("query") ?? "");
	return (
		<main className="flex min-h-dvh flex-col bg-[var(--color-bg-surface)]">
			<h1 className={isContactWindow() ? "sr-only" : "px-[var(--spacing-5)] pt-[var(--spacing-5)] text-h3"}>
				{t("chatActions.addContact")}
			</h1>
			{scan ? (
				<div className="flex flex-col gap-[var(--spacing-4)] p-[var(--spacing-5)]">
					<Button onClick={() => setScan(false)}>{t("app.back")}</Button>
					<QrScanner
						onResult={(value) => {
							if (value.startsWith("/i/")) navigate(value);
							else {
								setQuery(value);
								setScan(false);
							}
						}}
					/>
				</div>
			) : (
				<AddContacts
					key={query}
					initialQuery={query}
					onScan={() => setScan(true)}
					{...(!isContactWindow() ? { onInvite: () => navigate("/me/invite") } : {})}
					onOpen={(id) => {
						if (isContactWindow()) void notifyContactAdded(id);
						else navigate(`/messages/${encodeURIComponent(id)}`);
					}}
				/>
			)}
		</main>
	);
}
