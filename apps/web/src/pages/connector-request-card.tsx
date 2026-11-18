import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@yonder/ui-components";
import { useApi, usePerson } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { pendingConnectorRequest, setPendingConnectorRequest } from "../lib/connector-request.ts";

export function ConnectorRequestCard({ id, ready }: { id: string; ready: boolean }) {
	const { t } = useTranslation();
	const api = useApi();
	const person = usePerson();
	const navigate = useNavigate();
	const cache = useQueryClient();
	const key = ["connector-request", id] as const;
	const request = useQuery({ queryKey: key, queryFn: () => api.connectorRequest(id) });
	const confirm = useMutation({
		mutationFn: () => api.confirmConnectorRequest(id),
		onSuccess: (row) => {
			if (!person) return;
			setPendingConnectorRequest({ id: row.id, connectorId: row.connectorId, ownerId: person.id });
			cache.setQueryData(key, row);
			navigate("/me/connectors");
		},
	});
	const cancel = useMutation({
		mutationFn: () => api.cancelConnectorRequest(id),
		onSuccess: (row) => {
			if (pendingConnectorRequest()?.id === id) setPendingConnectorRequest(null);
			cache.setQueryData(key, row);
		},
	});
	if (request.isLoading) return <p role="status">{t("app.loading")}</p>;
	if (!request.data) return <p role="alert">{t("members.errors.unknown")}</p>;
	const row = request.data;
	return (
		<section className="flex flex-col gap-[var(--spacing-2)] rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] p-[var(--spacing-3)]">
			<strong>{t("connectors.requestCardTitle")}</strong>
			<p>{t(row.connectorId === "local-files" ? "connectors.localFiles.name" : "connectors.computerControl.name")}</p>
			<p className="whitespace-pre-wrap">{row.originalPrompt}</p>
			<p>{t(`connectors.requestState.${row.state}`)}</p>
			{row.state === "pending" || row.state === "approved" ? (
				<div className="flex gap-[var(--spacing-2)]">
					<Button disabled={!ready || !person} loading={confirm.isPending} onClick={() => confirm.mutate()}>
						{t("connectors.requestConfirm")}
					</Button>
					<Button loading={cancel.isPending} onClick={() => cancel.mutate()}>
						{t("app.cancel")}
					</Button>
				</div>
			) : null}
			{confirm.isError || cancel.isError ? <p role="alert">{t("connectors.requestFailed")}</p> : null}
		</section>
	);
}
