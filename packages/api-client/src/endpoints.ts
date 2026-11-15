/**
 * The endpoints this slice uses, each a typed function over the shared `ApiClient`. Generated
 * from `@yonder/protocol` by hand because there is one client and one caller; when the surface
 * grows, this file is what a generator would produce.
 */
import type {
	AddContactResponse,
	Attachment,
	AttachmentTextPreview,
	CompactConversationRequest,
	CompactConversationResponse,
	ConnectorCatalogResponse,
	ConnectorCommandResult,
	ConnectorInstance,
	ConnectorListResponse,
	Conversation,
	CreateBotRequest,
	CreateBotResponse,
	CreateConnectorRequest,
	CreateGroupRequest,
	DeleteAccountResponse,
	DeviceInfo,
	DeviceListResponse,
	DiscoverModelsRequest,
	InviteResponse,
	Member,
	MeResponse,
	MessagePage,
	PasswordSignInResponse,
	Provider,
	ProviderList,
	ProviderModelMetadata,
	QuotaLedgerPage,
	QuotaResponse,
	RateCardResponse,
	RefreshResponse,
	ResetPasswordRequest,
	ResolveInviteResponse,
	SaveProviderRequest,
	SaveSkillRequest,
	SendCodeRequest,
	SendCodeResponse,
	SendMessageRequest,
	SendMessageResponse,
	SetPasswordRequest,
	SignInRequest,
	SignInResponse,
	SkillDetail,
	SkillFileResponse,
	SkillListResponse,
	UpdateConnectorRequest,
	UpdateMeRequest,
	UpdateSkillRequest,
	UsagePage,
	WechatMiniPhoneRequest,
	WechatMiniSignInRequest,
	WechatMiniSignInResponse,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

export interface SessionSummary {
	id: string;
	deviceId: string | null;
	deviceName: string;
	platform: string;
	appVersion: string;
	lastSeenAt: string;
	createdAt: string;
	current: boolean;
}

export function createEndpoints(client: ApiClient) {
	return {
		openVoiceSocket(): WebSocket {
			if (!client.accessToken) throw new Error("Missing access token");
			const url = new URL("/v1/audio/transcriptions/realtime", client.baseUrl || globalThis.location.origin);
			url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
			url.searchParams.set("token", client.accessToken);
			return new WebSocket(url);
		},
		connectorCatalog(): Promise<ConnectorCatalogResponse> {
			return client.request("/v1/connectors/catalog");
		},
		connectors(): Promise<ConnectorListResponse> {
			return client.request("/v1/connectors");
		},
		createConnector(body: CreateConnectorRequest): Promise<ConnectorInstance> {
			return client.request("/v1/connectors", { body });
		},
		deleteConnector(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/connectors/${encodeURIComponent(id)}`, { method: "DELETE" });
		},
		updateConnector(id: string, body: UpdateConnectorRequest): Promise<ConnectorInstance> {
			return client.request(`/v1/connectors/${encodeURIComponent(id)}`, { method: "PATCH", body });
		},
		submitConnectorResult(commandId: string, body: ConnectorCommandResult): Promise<{ ok: true }> {
			return client.request(`/v1/connector-commands/${encodeURIComponent(commandId)}/result`, { body });
		},
		skills(): Promise<SkillListResponse> {
			return client.request("/v1/skills");
		},

		skill(id: string): Promise<SkillDetail> {
			return client.request(`/v1/skills/${encodeURIComponent(id)}`);
		},

		skillFile(id: string, path: string): Promise<SkillFileResponse> {
			return client.request(`/v1/skills/${encodeURIComponent(id)}/files?path=${encodeURIComponent(path)}`);
		},

		createSkill(body: SaveSkillRequest): Promise<SkillDetail> {
			return client.request("/v1/skills", { body });
		},

		updateSkill(id: string, body: UpdateSkillRequest): Promise<SkillDetail> {
			return client.request(`/v1/skills/${encodeURIComponent(id)}`, { method: "PATCH", body });
		},

		deleteSkill(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/skills/${encodeURIComponent(id)}`, { method: "DELETE" });
		},

		conversations(): Promise<{ items: Conversation[] }> {
			return client.request("/v1/conversations");
		},

		createBot(body: CreateBotRequest): Promise<CreateBotResponse> {
			return client.request("/v1/bots", { body });
		},

		contacts(): Promise<{ items: Member[] }> {
			return client.request("/v1/contacts");
		},

		searchContacts(query: string): Promise<{ items: Member[] }> {
			return client.request(`/v1/contacts/search?q=${encodeURIComponent(query)}`);
		},

		addContact(memberId: string): Promise<AddContactResponse> {
			return client.request("/v1/contacts", { body: { memberId } });
		},

		createGroup(body: CreateGroupRequest): Promise<Conversation> {
			return client.request("/v1/conversations/groups", { body });
		},

		messages(conversationId: string, cursor?: string): Promise<MessagePage> {
			const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages${query}`);
		},

		compactConversation(
			conversationId: string,
			body: CompactConversationRequest,
		): Promise<CompactConversationResponse> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/compact`, {
				body,
				idempotencyKey: body.clientNonce,
			});
		},

		sendMessage(conversationId: string, body: SendMessageRequest): Promise<SendMessageResponse> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
				body,
				idempotencyKey: body.clientNonce,
			});
		},

		uploadAttachment(file: File, clientNonce: string = crypto.randomUUID(), signal?: AbortSignal): Promise<Attachment> {
			const form = new FormData();
			form.set("file", file);
			form.set("clientNonce", clientNonce);
			return client.request("/v1/attachments", {
				raw: { bytes: form },
				idempotencyKey: clientNonce,
				...(signal ? { signal } : {}),
			});
		},

		attachmentContent(id: string): Promise<Blob> {
			return client.request(`/v1/attachments/${encodeURIComponent(id)}/content`, { responseType: "blob" });
		},

		/** A bounded thumbnail prefix; never store it as the complete attachment Blob. */
		attachmentPrefix(id: string, maxBytes = 4096, signal?: AbortSignal): Promise<Blob> {
			if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 4096)
				throw new RangeError("attachment prefix must be 1–4096 bytes");
			return client.request(`/v1/attachments/${encodeURIComponent(id)}/content`, {
				responseType: "blob",
				range: `bytes=0-${maxBytes - 1}`,
				...(signal ? { signal } : {}),
			});
		},

		attachmentPreviewText(id: string, signal?: AbortSignal): Promise<AttachmentTextPreview> {
			return client.request(`/v1/attachments/${encodeURIComponent(id)}/preview`, { ...(signal ? { signal } : {}) });
		},

		previewAttachmentText(file: File, signal?: AbortSignal): Promise<AttachmentTextPreview> {
			const form = new FormData();
			form.set("file", file);
			return client.request("/v1/attachments/preview", { raw: { bytes: form }, ...(signal ? { signal } : {}) });
		},

		transcribeAudio(file: File, signal?: AbortSignal): Promise<{ text: string }> {
			const form = new FormData();
			form.set("file", file);
			return client.request("/v1/audio/transcriptions", { raw: { bytes: form }, ...(signal ? { signal } : {}) });
		},

		stopMessage(messageId: string): Promise<{ ok: true }> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/stop`, { body: {} });
		},

		retryMessage(messageId: string, idempotencyKey: string): Promise<SendMessageResponse> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/retry`, { body: {}, idempotencyKey });
		},

		providers(): Promise<ProviderList> {
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

		wechatMiniSignIn(body: WechatMiniSignInRequest): Promise<WechatMiniSignInResponse> {
			return client.request("/v1/auth/wechat/mini/sign-in", { body, authenticated: false });
		},

		wechatMiniPhone(body: WechatMiniPhoneRequest): Promise<SignInResponse> {
			return client.request("/v1/auth/wechat/mini/phone", { body, authenticated: false });
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

		/** The published rate card; the quota page shows it under the billing explanation. */
		quotaRates(): Promise<RateCardResponse> {
			return client.request("/v1/quota/rates", { authenticated: false });
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

		devices(): Promise<DeviceListResponse> {
			return client.request("/v1/devices");
		},

		registerDevice(body: DeviceInfo & { installationId: string }): Promise<{ ok: true }> {
			return client.request("/v1/devices/register", { body });
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
