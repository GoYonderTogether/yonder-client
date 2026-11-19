import { Button, ListGroup, ListRow } from "@yonder/ui-components";
import { useDevices, useMe, useRevokeSession, useSessions, useSignOut } from "@yonder/ui-data";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DeleteAccountFlow } from "./delete-account-flow.tsx";
import { deviceDisplayName } from "./device-display-name.ts";
import { DeviceRow } from "./device-row.tsx";
import { HandleEditor } from "./handle-editor.tsx";
import { LoginMethods } from "./login-methods.tsx";

export interface AccountSectionProps {
	/** Opens the change-password page (账号与安全 › 修改密码). */
	onChangePassword: () => void;
	/** Opens the change-phone page (账号与安全 › 登录方式 › 手机号). */
	onChangePhone: () => void;
	/** After an explicit sign-out the next sign-in starts fresh, not on this page. */
	onSignedOut: () => void;
	onOpenDevices?: () => void;
}

/**
 * 账号与安全: the phone number, the password, the devices that are signed in, signing out, and
 * deleting the account. Every action here is real; none of them is a placeholder.
 */
export function AccountSection({ onChangePassword, onChangePhone, onSignedOut, onOpenDevices }: AccountSectionProps) {
	const { t } = useTranslation();
	const me = useMe();
	const sessions = useSessions();
	const devices = useDevices();
	const revoke = useRevokeSession();
	const signOut = useSignOut();

	const [confirmingDelete, setConfirmingDelete] = useState(false);

	const hasPassword = me.data?.hasPassword ?? false;

	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<HandleEditor />

			<LoginMethods onChangePhone={onChangePhone} />

			<ListGroup>
				<ListRow
					title={hasPassword ? t("me.account.changePassword") : t("me.account.setPassword")}
					trailing={hasPassword ? t("me.account.passwordSet") : t("me.account.passwordNotSet")}
					chevron
					onClick={onChangePassword}
				/>
			</ListGroup>

			<ListGroup
				title={
					onOpenDevices ? (
						<button
							type="button"
							onClick={onOpenDevices}
							aria-label={t("me.devices.open")}
							className="flex min-h-[var(--control-sm)] items-center gap-[var(--spacing-1)] rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
						>
							{t("me.account.sessions")}
							<ChevronRight size={14} aria-hidden />
						</button>
					) : (
						t("me.account.sessions")
					)
				}
			>
				{sessions.isLoading ? (
					<ListRow title={t("app.loading")} disabled className="hover:bg-transparent" />
				) : sessions.isError && !sessions.data ? (
					<ListRow
						title={t("me.devices.loadFailed")}
						trailing={t("app.retry")}
						onClick={() => void sessions.refetch()}
					/>
				) : sessions.data?.items.length ? (
					sessions.data.items.map((session) => {
						const device = devices.data?.items.find((item) => item.id === session.deviceId);
						const name = device ? deviceDisplayName(device) : session.deviceName;
						return (
							<DeviceRow
								key={session.id}
								name={name}
								systemName={name === device?.name ? undefined : device?.name}
								platform={session.platform}
								current={session.current}
								lastSeenAt={session.lastSeenAt}
								status={device?.status}
							>
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
							</DeviceRow>
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
					<DeleteAccountFlow onCancel={() => setConfirmingDelete(false)} />
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
