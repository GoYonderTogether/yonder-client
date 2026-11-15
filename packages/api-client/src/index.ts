/**
 * `@yonder/api-client` — the typed client for the gateway. One `request` function holds the
 * credentials, headers, error shape and the single refresh-and-retry; the endpoint table is a thin
 * typed wrapper over it.
 */

export type { ApiClientOptions, RequestOptions, TokenStore } from "./client.ts";
export { ApiClient, ApiError, NetworkError } from "./client.ts";
export type { Endpoints, SessionSummary } from "./endpoints.ts";
export { createEndpoints } from "./endpoints.ts";
