/**
 * `@yonder/ui-data` — layer 4. Server state, its cache, the realtime channel, and the platform
 * seams a feature needs (storage, tokens, theme, language).
 *
 * A feature module calls these hooks. It never calls `fetch`, never builds a cache key string, and
 * never copies server data into component or store state.
 */

export type { Endpoints, SessionSummary, UsageRunFilter } from "@yonder/api-client";
// Re-exported so a feature can branch on a failure without depending on the HTTP client package.
export { ApiError, NetworkError } from "@yonder/api-client";

export type { SessionState, SessionStatus } from "./auth/session-store.ts";
export { useSessionStore } from "./auth/session-store.ts";
export { createMemoryTokenStore } from "./auth/token-store.ts";
export {
	useBot,
	useChangeHandle,
	useDeleteAccount,
	useHealth,
	useMe,
	usePerson,
	usePhoneChange,
	useResetAccountCache,
	useRevokeSession,
	useSessions,
	useSetPassword,
	useSignOut,
	useUpdateMe,
	useUploadAvatar,
} from "./hooks/account.ts";
export {
	ownedBots,
	useDeleteBot,
	useReception,
	useSetReception,
	useUpdateBot,
	useUploadBotAvatar,
} from "./hooks/bots.ts";
export {
	useChannelActions,
	useChannelAttempt,
	useChannelConversations,
	useChannelMessages,
	useChannels,
} from "./hooks/channels.ts";
export type { CachedMessage } from "./hooks/chat.ts";
export { useConversations, useMessages, useRunActions, useSendMessage } from "./hooks/chat.ts";
export { useBillingActions, useBillingCatalog, useWechatWebActions, useWechatWebEnabled } from "./hooks/commerce.ts";
export { useCompactConversation } from "./hooks/compact.ts";
export {
	useConnectorRequest,
	useConnectorRequestActions,
	useConnectorRequestDevices,
} from "./hooks/connector-requests.ts";
export { useConnectorActions, useConnectorCatalog, useConnectors } from "./hooks/connectors.ts";
export { useContactActions, useContactSearch, useContacts } from "./hooks/contacts.ts";
export {
	useConversationListActions,
	useMarkConversationRead,
	useResetBotConversation,
	useSetConversationMuted,
} from "./hooks/conversation-state.ts";
export { useDeviceRegistration, useDevices, useSignOutDevice, useUpdateDeviceRemark } from "./hooks/devices.ts";
export { useFriendRequest, useFriendRequestActions, useFriendRequests } from "./hooks/friend-requests.ts";
export { useChangeGoal, useGoalSettings, useGoals } from "./hooks/goals.ts";
export { useGroupActions } from "./hooks/groups.ts";
export {
	useActiveBotSubtasks,
	useCreateItem,
	useItem,
	useItemActions,
	useItemListAction,
	useItemSession,
	useItems,
} from "./hooks/items.ts";
export { useMeeting, useMeetingActions, useMeetings } from "./hooks/meetings.ts";
export { useMemberProfile, usePublicMemberProfile } from "./hooks/members.ts";
export {
	deviceTimeZone,
	useMemoryActions,
	useMemoryDays,
	useMemoryFile,
	useMemoryFileActions,
	useMemoryFileRevisions,
	useMemoryFiles,
} from "./hooks/memory.ts";
export { usePrivacy, useUpdatePrivacy } from "./hooks/privacy.ts";
export { useProviderActions, useProviders } from "./hooks/providers.ts";
export { useQuestionCardAction } from "./hooks/question-cards.ts";
export {
	useInvite,
	useQuota,
	useQuotaConfig,
	useQuotaLedger,
	useQuotaRates,
	useResolvedInvite,
	useUsage,
	useUsageOverview,
	useUsageRunCalls,
	useUsageRuns,
} from "./hooks/quota.ts";
export { useScheduleActions, useSchedules } from "./hooks/schedules.ts";
export { useSkill, useSkillActions, useSkillFile, useSkills } from "./hooks/skills.ts";
export {
	useEditSocialLibrary,
	useMemoryOrganization,
	useReviewMemoryOrganization,
	useSaveSocialPersona,
	useSocialLibrary,
	useSocialPersona,
} from "./hooks/social.ts";
export { useOutwardActions, useStartBotChat, useVisitActions } from "./hooks/visits.ts";
export type { LocaleControl, ThemeControl } from "./preferences/preferences.ts";
export {
	readLocale,
	readStyleChoice,
	readThemeChoice,
	useLocalePreference,
	useSystemPrefersDark,
	useTheme,
} from "./preferences/preferences.ts";
export {
	CACHE_MAX_AGE_MS,
	CACHE_STORAGE_KEY,
	CACHE_VERSION,
	createPersister,
	createQueryClient,
} from "./query/client.ts";
export { ALL_ROOT_KEYS, keys } from "./query/keys.ts";
export type { DataContextValue, DataProviderProps } from "./query/provider.tsx";
export { DataProvider, useApi, useData, useDataQueryClient } from "./query/provider.tsx";
export type { ConnectionStatus, RealtimeHandlers, RealtimeOptions } from "./realtime/connection.ts";
export { RealtimeConnection, websocketUrl } from "./realtime/connection.ts";
export { applyServerEvent } from "./realtime/events.ts";
export { useRealtimeSync } from "./realtime/use-realtime-sync.ts";
export {
	attachmentCacheKey,
	chatCacheGeneration,
	outboxCacheKey,
	readChatCache,
	removeChatCache,
	updateChatCache,
	writeChatCache,
} from "./storage/chat-cache.ts";
export type { Storage } from "./storage/index.ts";
export { createBrowserStorage, createDefaultStorage, createMemoryStorage } from "./storage/index.ts";
export { clearInvite, readInvite, saveInvite } from "./storage/invite.ts";
