/**
 * `@yonder/feature-members` — who a member is and what you can do with them: the profile header,
 * a member row, Bot detail and the Bot form, group info and the member list (design 15 and 17).
 * Components land here as the work packages add them; nothing is exported until it exists.
 */

export { BotAvatarPicker } from "./bots/bot-avatar-picker.tsx";
export {
	BOT_AVATAR_COLORS,
	BOT_AVATAR_MAX_BYTES,
	BOT_AVATAR_TYPES,
	BOT_NAME_MAX,
	BOT_NAMES,
	randomBotName,
} from "./bots/bot-defaults.ts";
export { BotSettingsOverview, botConversation, plansInConversation } from "./bots/bot-detail.tsx";
export { BotForm } from "./bots/bot-form.tsx";
export { BotList } from "./bots/bot-list.tsx";
export type { ClosedGroupNoticeProps } from "./group/closed-group-notice.tsx";
export { ClosedGroupNotice } from "./group/closed-group-notice.tsx";
export { GroupAvatar } from "./group/group-avatar.tsx";
export type { GroupInfoProps } from "./group/group-info.tsx";
export { GroupInfo } from "./group/group-info.tsx";
export type { MemberListProps } from "./group/member-list.tsx";
export { MemberList } from "./group/member-list.tsx";
export { closedGroupNotice, systemEventText, type Translate } from "./group/system-events.ts";
export { PrivacySwitches } from "./privacy/privacy-switches.tsx";
export { memberFailureText } from "./profile/failure.ts";
export type { MemberHeaderProps } from "./profile/member-header.tsx";
export { MemberHeader } from "./profile/member-header.tsx";
export type { MemberProfileProps } from "./profile/member-profile.tsx";
export { MemberProfile } from "./profile/member-profile.tsx";
export type { MemberRowMember, MemberRowProps } from "./profile/member-row.tsx";
export { MemberRow } from "./profile/member-row.tsx";
