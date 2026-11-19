import type {
	AddContactResponse,
	AddGroupMembersRequest,
	ApproveVisitRequest,
	Conversation,
	CreateBotRequest,
	CreateBotResponse,
	CreateGroupRequest,
	FriendRequest,
	Member,
	MemberProfileResponse,
	PrivacySettings,
	ReceptionSetting,
	StartVisitRequest,
	StartVisitResponse,
	TransferGroupOwnerRequest,
	UpdateBotRequest,
	UpdateGroupRequest,
	UpdatePrivacyRequest,
	UpdateReceptionRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

/** Bots, contacts, groups, visits to someone else's Bot, and member cards. */
export function memberEndpoints(client: ApiClient) {
	return {
		createBot(body: CreateBotRequest): Promise<CreateBotResponse> {
			return client.request("/v1/bots", { body });
		},

		updateBot(id: string, body: UpdateBotRequest): Promise<Member> {
			return client.request(`/v1/bots/${encodeURIComponent(id)}`, { method: "PATCH", body });
		},

		uploadBotAvatar(id: string, file: Blob): Promise<Member> {
			return client.request(`/v1/bots/${encodeURIComponent(id)}/avatar`, {
				raw: { bytes: file, contentType: file.type || "application/octet-stream" },
			});
		},

		/** The server answers 204; the default Bot is refused with `default_bot_protected` (409). */
		deleteBot(id: string): Promise<void> {
			return client.request(`/v1/bots/${encodeURIComponent(id)}`, { method: "DELETE" });
		},

		friendRequests(): Promise<{ items: FriendRequest[] }> {
			return client.request("/v1/friend-requests");
		},
		friendRequest(id: string): Promise<{ request: FriendRequest }> {
			return client.request(`/v1/friend-requests/${encodeURIComponent(id)}`);
		},
		requestFriend(memberId: string): Promise<{ request: FriendRequest }> {
			return client.request("/v1/friend-requests", { body: { memberId } });
		},
		acceptFriendRequest(id: string): Promise<{ request: FriendRequest; conversation: Conversation }> {
			return client.request(`/v1/friend-requests/${encodeURIComponent(id)}/accept`, { body: {} });
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

		/** Group owner only. Every group call below answers the conversation as the caller now sees it. */
		updateGroup(conversationId: string, body: UpdateGroupRequest): Promise<Conversation> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}`, { method: "PATCH", body });
		},

		addGroupMembers(conversationId: string, body: AddGroupMembersRequest): Promise<Conversation> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/members`, { body });
		},

		/**
		 * The owner removes someone, or a member removes themself (leaving). A leaver's group drops
		 * out of their list and the server answers 204; a removed member keeps a read-only copy.
		 */
		removeGroupMember(conversationId: string, memberId: string): Promise<void> {
			return client.request(
				`/v1/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(memberId)}`,
				{ method: "DELETE" },
			);
		},

		transferGroupOwner(conversationId: string, body: TransferGroupOwnerRequest): Promise<Conversation> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/owner`, { body });
		},

		dissolveGroup(conversationId: string): Promise<Conversation> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/dissolve`, { body: {} });
		},

		/** Open, or find again, the chat with another person's Bot by its public handle (19 第二节). */
		startVisit(body: StartVisitRequest): Promise<StartVisitResponse> {
			return client.request("/v1/visits", { body });
		},

		/**
		 * The Bot's owner lets a stranger carry on past the trial. `hostPays` is the one advanced
		 * choice, "this errand is mine": the owner's external pool pays instead of the visitor.
		 */
		approveVisit(visitId: string, body: ApproveVisitRequest = {}): Promise<Conversation> {
			return client.request(`/v1/visits/${encodeURIComponent(visitId)}/approve`, { body });
		},

		denyVisit(visitId: string): Promise<Conversation> {
			return client.request(`/v1/visits/${encodeURIComponent(visitId)}/deny`, { body: {} });
		},

		/**
		 * The visitor agrees to pay for the rest of the chat from their own main quota. The first
		 * message after an approval is refused with `visit_confirm` until this is called once.
		 */
		payVisit(visitId: string): Promise<Conversation> {
			return client.request(`/v1/visits/${encodeURIComponent(visitId)}/pay`, { body: {} });
		},

		privacy(): Promise<PrivacySettings> {
			return client.request("/v1/me/privacy");
		},

		updatePrivacy(body: UpdatePrivacyRequest): Promise<PrivacySettings> {
			return client.request("/v1/me/privacy", { method: "PATCH", body });
		},

		/** The Bot that receives people who come with a matter; the default Bot until one is chosen. */
		reception(): Promise<ReceptionSetting> {
			return client.request("/v1/me/reception");
		},

		setReception(body: UpdateReceptionRequest): Promise<ReceptionSetting> {
			return client.request("/v1/me/reception", { method: "PUT", body });
		},

		socialKnowledge(): Promise<{ approved: string; drafts: { id: string; content: string; createdAt: string }[] }> {
			return client.request("/v1/me/social");
		},
		saveSocialKnowledge(
			content: string,
		): Promise<{ approved: string; drafts: { id: string; content: string; createdAt: string }[] }> {
			return client.request("/v1/me/social", { method: "PUT", body: { content } });
		},
		socialDraft(
			id: string,
			approve: boolean,
		): Promise<{ approved: string; drafts: { id: string; content: string; createdAt: string }[] }> {
			return client.request(
				`/v1/me/social/drafts/${encodeURIComponent(id)}${approve ? "/approve" : ""}`,
				approve ? { body: {} } : { method: "DELETE" },
			);
		},
		botSocial(id: string): Promise<{ content: string }> {
			return client.request(`/v1/bots/${encodeURIComponent(id)}/social`);
		},
		saveBotSocial(id: string, content: string): Promise<{ content: string }> {
			return client.request(`/v1/bots/${encodeURIComponent(id)}/social`, { method: "PUT", body: { content } });
		},

		/** A card read by someone signed in: carries the relation and the ids the page acts on. */
		memberProfile(handle: string): Promise<MemberProfileResponse> {
			return client.request(`/v1/members/${encodeURIComponent(handle)}`);
		},

		/**
		 * The same card for someone who is not signed in. It sends no token, so a missing session
		 * never starts a refresh or reports a lost session.
		 */
		publicMemberProfile(handle: string): Promise<MemberProfileResponse> {
			return client.request(`/v1/members/${encodeURIComponent(handle)}`, { authenticated: false });
		},
	};
}
