/**
 * `@yonder/protocol` — the shared vocabulary. Format definitions only: no logic, no runtime
 * dependencies, no import from any other workspace package.
 */

export type { AgentMessage, AgentToolCall, AgentToolDefinition } from "./agent/tools.ts";
export type {
	ChangePhoneRequest,
	DeleteAccountRequest,
	DeleteAccountResponse,
	DeviceInfo,
	PasswordSignInRequest,
	PasswordSignInResponse,
	PhoneChangeCodeRequest,
	PhoneChannel,
	PushTokenRegistration,
	RefreshResponse,
	ResetPasswordRequest,
	SendCodeRequest,
	SendCodeResponse,
	SetPasswordRequest,
	SignInRequest,
	SignInResponse,
	WechatMiniPhoneRequest,
	WechatMiniSignInRequest,
	WechatMiniSignInResponse,
} from "./auth/auth.ts";
export type {
	ChannelAttempt,
	ChannelConnection,
	ChannelConversationAction,
	ChannelProvider,
	ExternalChannelConversation,
	ExternalChannelMessagePage,
} from "./chat/channels.ts";
export type {
	AddContactResponse,
	AddGroupMembersRequest,
	ApproveVisitRequest,
	Attachment,
	AttachmentTextPreview,
	Conversation,
	ConversationMember,
	ConversationVisit,
	CreateBotRequest,
	CreateBotResponse,
	CreateGroupRequest,
	GroupSystemEvent,
	MemoryUpdateChange,
	MemoryUpdatedSystemEvent,
	Message,
	MessagePage,
	Run,
	SendMessageRequest,
	SendMessageResponse,
	StartVisitRequest,
	StartVisitResponse,
	SystemEvent,
	SystemEventKind,
	TransferGroupOwnerRequest,
	UpdateBotRequest,
	UpdateGroupRequest,
	VisitState,
} from "./chat/chat.ts";
export type { CompactConversationRequest, CompactConversationResponse } from "./chat/compaction.ts";
export type { Goal, GoalAction, GoalChange, GoalProgress, GoalState, OnboardingStep } from "./chat/goals.ts";
export type {
	ItemDetail,
	ItemListResponse,
	ItemSource,
	ItemState,
	ItemStep,
	ItemSummary,
} from "./chat/items.ts";
export type { OutwardRequestAction, OutwardRequestCard, OutwardRequestState } from "./chat/outward.ts";
export type {
	CreateScheduleRequest,
	Schedule,
	ScheduleAction,
	ScheduleKind,
	ScheduleListResponse,
	ScheduleRun,
	ScheduleRunResult,
	ScheduleStatus,
	UpdateScheduleRequest,
} from "./chat/schedule.ts";
export type { SubtaskStatus, SubtaskSummary } from "./chat/subtask.ts";
export type { ApiErrorBody, ErrorCode, Timestamp } from "./common/error.ts";
export { ERROR_CODES } from "./common/error.ts";
export type {
	ConnectorCapabilities,
	ConnectorCatalogResponse,
	ConnectorCommand,
	ConnectorCommandArgs,
	ConnectorCommandResult,
	ConnectorDefinition,
	ConnectorExecutionError,
	ConnectorInstance,
	ConnectorListResponse,
	ConnectorOperation,
	ConnectorScope,
	CreateConnectorRequest,
	LocalFilesResult,
	UpdateConnectorRequest,
} from "./connectors/connectors.ts";
export type { DeviceListResponse, DeviceSummary } from "./devices/devices.ts";
export type {
	CreateMeetingRequest,
	MeetingBatchState,
	MeetingRecord,
	MeetingSegment,
	MeetingSegmentManifest,
	MeetingStage,
	MeetingStatus,
	MeetingTranscriptBatch,
	RetryMeetingRequest,
} from "./meetings/meetings.ts";
export type { FriendRequest } from "./member/friend-request.ts";
export type {
	CardBot,
	ChangeHandleRequest,
	ChangeHandleResponse,
	HandleChange,
	LocalePreference,
	Member,
	MemberCard,
	MemberKind,
	MemberProfileResponse,
	MemberSettings,
	MeResponse,
	PrivacySettings,
	ReceptionSetting,
	SignInMethodSummary,
	ThemePreference,
	UpdateMeRequest,
	UpdatePrivacyRequest,
	UpdateReceptionRequest,
} from "./member/member.ts";
export type {
	MemoryFileAuthor,
	MemoryFileContent,
	MemoryFileKind,
	MemoryFileLimit,
	MemoryFileList,
	MemoryFileRevision,
	MemoryFileRevisionList,
	MemoryFileSource,
	MemoryFileSummary,
	RevertMemoryFileRequest,
	UpdateMemoryFileProtectionRequest,
	UpdateMemoryFileRequest,
	UpdateMemoryFileVisibilityRequest,
} from "./memory/files.ts";
export type {
	MemoryActivity,
	MemoryBlock,
	MemoryDay,
	MemoryDayPage,
	MemoryEntry,
	MemoryKind,
	MemoryLink,
	MemoryMaterial,
	MemoryMedia,
	MemoryPerson,
	MemorySize,
	MemorySource,
	MemoryStay,
	MemoryTarget,
	MemoryVisibility,
	MemoryWeight,
	UpdateMemoryRequest,
} from "./memory/memory.ts";
export type {
	DiscoverModelsRequest,
	PlatformModel,
	Provider,
	ProviderList,
	ProviderModelMetadata,
	SaveProviderRequest,
} from "./models/provider.ts";
export type {
	InviteResponse,
	LedgerEntry,
	QuotaConfigResponse,
	QuotaCycle,
	QuotaLedgerPage,
	QuotaLedgerPool,
	QuotaOverflowRule,
	QuotaPool,
	QuotaPoolBalance,
	QuotaResponse,
	RateCardEntry,
	RateCardResponse,
	ResolveInviteResponse,
	UsageEntry,
	UsageOverview,
	UsagePage,
	UsagePurpose,
	UsageRun,
	UsageRunPage,
	UsageTotals,
} from "./quota/quota.ts";
export type { ClientEvent, MessageNotification, ServerEvent, ServerEventType } from "./realtime/realtime.ts";
export {
	REALTIME_CLOSE_SESSION_REVOKED,
	REALTIME_CLOSE_UNAUTHORIZED,
	REALTIME_HEARTBEAT_MS,
	REALTIME_PATH,
} from "./realtime/realtime.ts";
export type {
	SaveSkillRequest,
	SkillDetail,
	SkillFileResponse,
	SkillListResponse,
	SkillSummary,
	UpdateSkillRequest,
} from "./skills/skills.ts";
export type { VersionPayload } from "./version/version-payload.ts";
