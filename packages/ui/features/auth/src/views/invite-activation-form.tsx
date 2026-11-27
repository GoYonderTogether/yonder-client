import { AuthActions, AuthStack, AuthTitle } from "@yonder/auth-presentation";
import type { DeviceInfo, SignInResponse } from "@yonder/protocol";
import { Button, Field, TextInput } from "@yonder/ui-components";
import { ApiError, useApi, useResolvedInvite } from "@yonder/ui-data";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { describeFailure, type Translate } from "../hooks/describe-failure.ts";

export function InviteActivationForm({
	ticket,
	prefill,
	device,
	onSignedIn,
	onSwitchAccount,
}: {
	ticket: string;
	prefill: string | null;
	device: DeviceInfo;
	onSignedIn: (result: SignInResponse) => void;
	onSwitchAccount: () => void;
}) {
	const { t } = useTranslation();
	const api = useApi();
	const invite = useResolvedInvite(prefill);
	const [code, setCode] = useState(prefill ?? "");
	const [failure, setFailure] = useState<unknown>(null);
	const [pasting, setPasting] = useState(false);
	const [busy, setBusy] = useState(false);
	const request = useRef(false);
	const selected = code.trim() === prefill ? invite.data : null;
	const expired = failure instanceof ApiError && failure.code === "invite_ticket_expired";
	const previewError = code.trim() === prefill && invite.error instanceof ApiError;
	const error = failure ?? (previewError ? invite.error : null);

	async function submit() {
		if (request.current || expired || !code.trim()) return;
		request.current = true;
		setBusy(true);
		setFailure(null);
		try {
			onSignedIn(await api.redeemInvite({ ticket, code: code.trim(), device }));
		} catch (error) {
			setFailure(error);
		} finally {
			request.current = false;
			setBusy(false);
		}
	}

	async function paste(input: HTMLInputElement | null | undefined) {
		try {
			setCode((await navigator.clipboard.readText()).trim());
			setFailure(null);
			setPasting(false);
		} catch {
			setPasting(true);
		}
		input?.focus();
	}

	return (
		<form
			className="w-full max-w-[400px] [&+button]:hidden"
			onSubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<AuthStack as="div">
				<AuthTitle as="h1">{t("auth.inviteActivation.title")}</AuthTitle>
				<Field
					label={t("auth.inviteActivation.code")}
					htmlFor="beta-invite-code"
					action={
						<Button
							type="button"
							variant="link"
							size="sm"
							disabled={busy || expired}
							onClick={(event) => void paste(event.currentTarget.form?.querySelector("input"))}
						>
							{t("auth.inviteActivation.paste")}
						</Button>
					}
				>
					<TextInput
						id="beta-invite-code"
						className="auth-control"
						fieldSize="lg"
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						disabled={busy || expired}
						value={code}
						onChange={(event) => {
							setCode(event.target.value);
							setFailure(null);
							setPasting(false);
						}}
					/>
				</Field>
				{selected || pasting ? (
					<p className="text-caption text-[var(--color-text-secondary)]" role="status">
						{pasting
							? t("auth.inviteActivation.pasteHint")
							: selected?.kind === "official"
								? t("auth.inviteActivation.official")
								: t("auth.invitedBy", { name: selected?.inviter.displayName })}
					</p>
				) : null}
				{error ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{describeFailure(error, t as unknown as Translate).text}
					</p>
				) : null}
				<AuthActions as="div">
					<Button
						type="submit"
						variant="primary"
						size="lg"
						className="auth-primary"
						block
						loading={busy}
						disabled={!code.trim() || expired}
					>
						{t("auth.inviteActivation.join")}
					</Button>
					<Button type="button" variant="link" disabled={busy} onClick={onSwitchAccount}>
						{t(expired ? "auth.inviteActivation.verifyAgain" : "auth.inviteActivation.switchAccount")}
					</Button>
				</AuthActions>
			</AuthStack>
		</form>
	);
}
