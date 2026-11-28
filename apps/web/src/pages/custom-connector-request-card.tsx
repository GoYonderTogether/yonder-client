import { InteractionCard, InteractionCardActions } from "@yonder/chat-presentation";
import type { ConnectorRequestView } from "@yonder/protocol";
import { Button, InlineError } from "@yonder/ui-components";
import { ICON_SIZE, ICON_STROKE } from "@yonder/ui-tokens";
import { Check, LockKeyhole, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { customConnectorsSupported } from "../lib/custom-connectors-runtime.tsx";
import { invokeLocalFiles, useLocalFilesContext } from "../lib/local-files.ts";

type Proposal = NonNullable<ConnectorRequestView["proposal"]>;

/**
 * A Bot-written connector's card (20261128-people-archive 03 §2). It is a confirm card like the
 * built-in one, but the tap that matters is on the target device: the server refuses an in-app
 * allow (`custom_confirm_on_device`), and the device writes its grant only after checking that the
 * entry on disk hashes to what this card shows. The confirm button therefore appears only in the
 * main window of the target device, and uses the device's own confirmation command — the same
 * local-write-then-report step the built-in flow ends in.
 */
export function CustomConnectorRequestCard({ row }: { row: ConnectorRequestView }) {
	const { t } = useTranslation();
	const proposal = row.proposal as Proposal;
	const context = useLocalFilesContext();
	// A custom proposal is confirmed on its device before the server creates the connection row, so
	// the card normally names none: the device then makes the id itself and its ready report creates
	// the row with it (03 §3). A connection the card does name is reused.
	const connectionId = row.connectionIds[0];
	/**
	 * The entry-hash revision the server expects on the ready report. The proposal payload does not
	 * carry it yet (the server's `CustomConnectorProposal` has no `revision`), and a first proposal
	 * starts at 1; a re-proposed connector needs the field on the card to be confirmable here.
	 */
	const proposalRevision = (proposal as { revision?: number }).revision ?? 1;
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const settled = row.state === "granted" || row.state === "cancelled";
	const onTarget = context !== null && proposal.deviceId === context.deviceId;
	const Glyph = row.state === "granted" ? Check : row.state === "cancelled" ? X : LockKeyhole;
	const toolMode = (mode: "query" | "act") =>
		t(mode === "query" ? "connectors.requestCustomToolQuery" : "connectors.requestCustomToolAct", {
			name: proposal.manifest.name,
		});

	async function confirm() {
		if (!context || !proposal.deviceId) return;
		setBusy(true);
		setError(undefined);
		try {
			// The shell re-reads the package, checks the hash against this card's value, writes the
			// grant and emits `connector.custom.ready`, which the runtime forwards on the socket.
			await invokeLocalFiles("custom_connector_confirm", {
				context,
				confirm: {
					...(connectionId ? { connectionId } : {}),
					revision: proposalRevision,
					slug: proposal.slug,
					entrySha256: proposal.entrySha256,
				},
			});
		} catch (failure) {
			// A hash mismatch is the one refusal the owner must act on: re-propose, then confirm again.
			const code = failure instanceof Error ? failure.message : String(failure);
			setError(t(code === "needs_reauth" ? "connectors.requestCustomChanged" : "connectors.requestFailed"));
		} finally {
			setBusy(false);
		}
	}

	const title = settled
		? t(`connectors.requestState.${row.state}`)
		: t("connectors.requestCustomTitle", { name: proposal.manifest.name, device: proposal.deviceName ?? "" });
	return (
		<InteractionCard
			as="div"
			title={title}
			label={title}
			detail={
				settled ? undefined : row.reason ? t("connectors.requestCustomDetail", { reason: row.reason }) : undefined
			}
			glyph={<Glyph aria-hidden size={ICON_SIZE.md} strokeWidth={ICON_STROKE.normal} />}
		>
			{!settled ? (
				<ul className="interaction-card-choices">
					{proposal.manifest.tools.map((tool) => (
						<li key={tool.name} className="interaction-card-choice">
							{toolMode(tool.mode)}
						</li>
					))}
				</ul>
			) : null}
			{!settled && Object.keys(proposal.manifest.events).length ? (
				<p className="interaction-card-status">{t("connectors.requestCustomEvents")}</p>
			) : null}
			{row.state === "pending" || row.state === "dispatched" ? (
				<InteractionCardActions as="div">
					{onTarget && customConnectorsSupported() ? (
						<Button variant="primary" loading={busy} disabled={busy} onClick={() => void confirm()}>
							{t("connectors.requestAllow")}
						</Button>
					) : (
						<p className="interaction-card-status" role="status">
							{t("connectors.requestCustomConfirmOnDevice", { device: proposal.deviceName ?? "" })}
						</p>
					)}
				</InteractionCardActions>
			) : null}
			{error ? <InlineError>{error}</InlineError> : null}
		</InteractionCard>
	);
}
