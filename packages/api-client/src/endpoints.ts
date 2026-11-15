/**
 * The endpoints this slice uses, each a typed function over the shared `ApiClient`. Generated
 * from `@yonder/protocol` by hand because there is one client and one caller; when the surface
 * grows, this file is what a generator would produce.
 */
import type {
	Conversation,
	DeleteAccountResponse,
	DiscoverModelsRequest,
	InviteResponse,
	MeResponse,
	MessagePage,
	PasswordSignInResponse,
	Provider,
	ProviderModelMetadata,
	QuotaLedgerPage,
	QuotaResponse,
	RefreshResponse,
	ResetPasswordRequest,
	ResolveInviteResponse,
	SaveProviderRequest,
	SendCodeRequest,
	SendCodeResponse,
	SendMessageRequest,
	SendMessageResponse,
	SetPasswordRequest,
	SignInRequest,
	SignInResponse,
	UpdateMeRequest,
	UsagePage,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

export interface SessionSummary {
	id: string;
	deviceName: string;
	platform: string;
	appVersion: string;
	lastSeenAt: string;
	createdAt: string;
	current: boolean;
}

export function createEndpoints(client: ApiClient) {
	return {
		conversations(): Promise<{ items: Conversation[] }> {
			return client.request("/v1/conversations");
		},

		messages(conversationId: string, cursor?: string): Promise<MessagePage> {
			const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages${query}`);
		},

		sendMessage(conversationId: string, body: SendMessageRequest): Promise<SendMessageResponse> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
				body,
				idempotencyKey: body.clientNonce,
			});
		},

		stopMessage(messageId: string): Promise<{ ok: true }> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/stop`, { body: {} });
		},

		retryMessage(messageId: string, idempotencyKey: string): Promise<SendMessageResponse> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/retry`, { body: {}, idempotencyKey });
		},

		providers(): Promise<{ items: Provider[] }> {
			return client.request("/v1/providers");
		},

		discoverModels(
			body: DiscoverModelsRequest,
		): Promise<{ models: string[]; metadata?: Record<string, ProviderModelMetadata> }> {
			return client.request("/v1/providers/models", { body });
		},

		createProvider(body: SaveProviderRequest): Promise<Provider> {
			return client.request("/v1/providers", { body });
		},

		updateProvider(id: string, body: SaveProviderRequest): Promise<Provider> {
			return client.request(`/v1/providers/${encodeURIComponent(id)}`, { method: "PATCH", body });
		},

		deleteProvider(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
		},

		testProvider(id: string): Promise<{ ok: boolean }> {
			return client.request(`/v1/providers/${encodeURIComponent(id)}/test`, { body: {} });
		},

		setDefaultProvider(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/providers/${encodeURIComponent(id)}/default`, { body: {} });
		},

		sendCode(body: SendCodeRequest): Promise<SendCodeResponse> {
			return client.request("/v1/auth/code", { body, authenticated: false });
		},

		signIn(body: SignInRequest): Promise<SignInResponse> {
			return client.request("/v1/auth/sign-in", { body, authenticated: false });
		},

		signInWithPassword(body: {
			target: string;
			password: string;
			device?: SignInRequest["device"];
		}): Promise<PasswordSignInResponse> {
			return client.request("/v1/auth/password", { body, authenticated: false });
		},

		refresh(body: { refreshToken?: string }): Promise<RefreshResponse> {
			return client.request("/v1/auth/refresh", { body, authenticated: false });
		},

		resetPasswordWithCode(body: ResetPasswordRequest): Promise<{ ok: true }> {
			return client.request("/v1/auth/reset-password", { body, authenticated: false });
		},

		signOut(body: { allDevices?: boolean } = {}): Promise<{ ok: true }> {
			return client.request("/v1/auth/sign-out", { body });
		},

		health(): Promise<{ ok: true; version: string; time: string; sms: string }> {
			return client.request("/v1/health", { authenticated: false });
		},

		me(): Promise<MeResponse> {
			return client.request("/v1/me");
		},

		resolveInvite(code: string): Promise<ResolveInviteResponse> {
			return client.request("/v1/invite/resolve", { body: { code }, authenticated: false });
		},

		invite(): Promise<InviteResponse> {
			return client.request("/v1/invite");
		},

		quota(): Promise<QuotaResponse> {
			return client.request("/v1/quota");
		},

		quotaLedger(cursor?: string): Promise<QuotaLedgerPage> {
			const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
			return client.request(`/v1/quota/ledger${query}`);
		},

		usage(cursor?: string): Promise<UsagePage> {
			const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
			return client.request(`/v1/usage${query}`);
		},

		updateMe(body: UpdateMeRequest): Promise<MeResponse> {
			return client.request("/v1/me", { method: "PATCH", body });
		},

		uploadAvatar(file: Blob): Promise<MeResponse> {
			return client.request("/v1/me/avatar", {
				raw: { bytes: file, contentType: file.type || "application/octet-stream" },
			});
		},

		setPassword(body: SetPasswordRequest): Promise<{ ok: true }> {
			return client.request("/v1/me/password", { body });
		},

		sessions(): Promise<{ items: SessionSummary[] }> {
			return client.request("/v1/me/sessions");
		},

		revokeSession(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
		},

		deleteAccount(body: { confirmHandle: string; reason?: string }): Promise<DeleteAccountResponse> {
			return client.request("/v1/me", { method: "DELETE", body });
		},
	};
}

export type Endpoints = ReturnType<typeof createEndpoints>;
