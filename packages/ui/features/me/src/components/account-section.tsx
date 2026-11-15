import { Button, Field, ListGroup, ListRow, TextInput } from "@yonder/ui-components";
import { useDeleteAccount, useMe, useRevokeSession, useSessions, useSignOut } from "@yonder/ui-data";
import { Laptop, Smartphone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export interface AccountSectionProps {
	/** Opens the change-password page (账号与安全 › 修改密码). */
	onChangePassword: () => void;
	/** After an explicit sign-out the next sign-in starts fresh, not on this page. */
	onSignedOut: () => void;
}

/**
 * 账号与安全: the phone number, the password, the devices that are signed in, signing out, and
 * deleting the account. Every action here is real; none of them is a placeholder.
 */
export function AccountSection({ onChangePassword, onSignedOut }: AccountSectionProps) {
	const { t, i18n } = useTranslation();
	const me = useMe();
	const sessions = useSessions();
	const revoke = useRevokeSession();
	const signOut = useSignOut();
	const removeAccount = useDeleteAccount();

	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [confirmHandle, setConfirmHandle] = useState("");
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const person = me.data?.member;
	const hasPassword = me.data?.hasPassword ?? false;

	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<ListGroup>
				<ListRow
					title={t("me.account.phone")}
					trailing={<span className="tabular-nums">{me.data?.signInMethods[0]?.masked ?? "—"}</span>}
					disabled
					className="hover:bg-transparent"
				/>
				<ListRow
					title={hasPassword ? t("me.account.changePassword") : t("me.account.setPassword")}
					trailing={hasPassword ? t("me.account.passwordSet") : t("me.account.passwordNotSet")}
					chevron
					onClick={onChangePassword}
				/>
			</ListGroup>

			<ListGroup title={t("me.account.sessions")}>
				{sessions.isLoading ? (
					<ListRow title={t("app.loading")} disabled className="hover:bg-transparent" />
				) : sessions.data && sessions.data.items.length > 0 ? (
					sessions.data.items.map((session) => {
						const Icon = /ios|android/i.test(session.platform) ? Smartphone : Laptop;
						return (
							<li
								key={session.id}
								className="group/row relative flex min-h-[var(--row-height)] items-center gap-[var(--spacing-3)] px-[var(--spacing-4)] py-[var(--spacing-2)]"
							>
								<Icon size={18} strokeWidth={1.7} className="shrink-0 text-[var(--color-text-tertiary)]" aria-hidden />
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-body text-[var(--color-text-primary)]">
										{session.deviceName}
										{session.current ? (
											<span className="ms-[var(--spacing-2)] text-micro text-[var(--color-accent-text)]">
												{t("me.account.sessionCurrent")}
											</span>
										) : null}
									</span>
									<span className="text-caption text-[var(--color-text-tertiary)]">
										{session.platform} · {formatDate(session.lastSeenAt, i18n.resolvedLanguage ?? i18n.language)}
									</span>
								</span>
								{!session.current ? (
									<Button
										type="button"
										variant="secondary"
										size="sm"
										loading={revoke.isPending && revoke.variables === session.id}
										onClick={() => revoke.mutate(session.id)}
									>
										{t("me.account.sessionRevoke")}
									</Button>
								) : null}
								<span className="pointer-events-none absolute end-0 bottom-0 start-[var(--spacing-4)] h-px bg-[var(--color-border-subtle)] group-last/row:hidden" />
							</li>
						);
					})
				) : (
					<ListRow title={t("me.account.sessionsEmpty")} disabled className="hover:bg-transparent" />
				)}
			</ListGroup>

			<ListGroup>
				<ListRow
					title={t("me.account.signOut")}
					tone="danger"
					onClick={() => {
						// The page is left in the same click: once the session is gone this screen unmounts,
						// and a callback that waits for the request would never run.
						signOut.mutate();
						onSignedOut();
					}}
					disabled={signOut.isPending}
					className="justify-center"
				/>
			</ListGroup>

			<div className="flex flex-col gap-[var(--spacing-3)]">
				{confirmingDelete ? (
					<div className="flex flex-col gap-[var(--spacing-4)] rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] p-[var(--spacing-4)]">
						<p className="text-caption text-[var(--color-text-secondary)]">{t("me.account.deleteAccountBody")}</p>
						<Field
							label={t("me.account.deleteAccountConfirmLabel", { handle: person?.handle ?? "" })}
							htmlFor="confirm-handle"
							error={deleteError ?? undefined}
						>
							<TextInput
								id="confirm-handle"
								value={confirmHandle}
								onChange={(event) => setConfirmHandle(event.target.value)}
								autoComplete="off"
								invalid={Boolean(deleteError)}
							/>
						</Field>
						<div className="flex gap-[var(--spacing-2)]">
							<Button type="button" variant="secondary" onClick={() => setConfirmingDelete(false)}>
								{t("app.cancel")}
							</Button>
							<Button
								type="button"
								variant="danger"
								loading={removeAccount.isPending}
								disabled={confirmHandle.trim() !== (person?.handle ?? "")}
								onClick={() => {
									setDeleteError(null);
									removeAccount.mutate(
										{ confirmHandle: confirmHandle.trim() },
										{ onError: () => setDeleteError(t("me.account.deleteAccountConfirmMismatch")) },
									);
								}}
							>
								{t("me.account.deleteAccount")}
							</Button>
						</div>
					</div>
				) : (
					<button
						type="button"
						onClick={() => setConfirmingDelete(true)}
						className="self-center px-[var(--spacing-3)] py-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
					>
						{t("me.account.deleteAccount")}
					</button>
				)}
			</div>
		</div>
	);
}

function formatDate(iso: string, locale: string): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
