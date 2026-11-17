/**
 * `@yonder/protocol` — the shared vocabulary. Format definitions only: no logic, no runtime
 * dependencies, no import from any other workspace package.
 */

export type { AgentMessage, AgentToolCall, AgentToolDefinition } from "./agent/tools.ts";
export type {
	DeleteAccountRequest,
	DeleteAccountResponse,
	DeviceInfo,
	PasswordSignInRequest,
	PasswordSignInResponse,
	PhoneChannel,
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
	AddContactResponse,
	Attachment,
	AttachmentTextPreview,
	Conversation,
	ConversationMember,
	CreateBotRequest,
	CreateBotResponse,
	CreateGroupRequest,
	Message,
	MessagePage,
	Run,
	SendMessageRequest,
	SendMessageResponse,
} from "./chat/chat.ts";
export type { CompactConversationRequest, CompactConversationResponse } from "./chat/compaction.ts";
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
export type {
	LocalePreference,
	Member,
	MemberKind,
	MemberSettings,
	MeResponse,
	SignInMethodSummary,
	ThemePreference,
	UpdateMeRequest,
} from "./member/member.ts";
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
	UsagePage,
} from "./quota/quota.ts";
export type { ClientEvent, ServerEvent, ServerEventType } from "./realtime/realtime.ts";
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
