const KEY = "yonder.connector-request";
export interface PendingConnectorRequest {
	id: string;
	ownerId: string;
	connectorId: "local-files" | "computer-control";
	connectionId?: string;
}
export function pendingConnectorRequest(): PendingConnectorRequest | null {
	try {
		const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as PendingConnectorRequest | null;
		return value &&
			typeof value.id === "string" &&
			typeof value.ownerId === "string" &&
			(value.connectorId === "local-files" || value.connectorId === "computer-control")
			? value
			: null;
	} catch {
		return null;
	}
}
export function setPendingConnectorRequest(value: PendingConnectorRequest | null): void {
	if (value) sessionStorage.setItem(KEY, JSON.stringify(value));
	else sessionStorage.removeItem(KEY);
}
