import { accountMessagesEn } from "./account-en.ts";
import { modelMessagesEn } from "./models-en.ts";
/**
 * The English table is the reference: its shape is the type every other language must satisfy, so
 * a missing or misspelled key is a compile error rather than a blank label at runtime.
 */
export const en = {
	app: {
		name: "Yonder",
		loading: "Loading…",
		loadFailed: "Unable to load this page.",
		reload: "Reload page",
		reloadConfirm: "Reload the page? Unsaved changes may be lost.",
		retry: "Try again",
		cancel: "Cancel",
		save: "Save",
		saving: "Saving…",
		close: "Close",
		back: "Back",
		continue: "Continue",
		skip: "Skip for now",
		skipStep: "Skip this step",
		done: "Done",
		copy: "Copy",
		copied: "Copied",
		remove: "Remove",
		confirm: "Confirm",
	},

	legal: { version: "Version {{version}}", effectiveDate: "Effective {{date}}" },

	landing: {
		allDownloads: "All downloads",
		backHome: "Yonder home",
		choosePlatform: "Wrong platform? Choose manually",
		copyLink: "Copy link",
		copied: "Copied",
		copyFailed: "Could not copy",
		downloadFor: "Download for {{platform}}",
		inApp: "In {{app}}, tap ··· and choose Open in browser.",
		macRequirement: "Apple silicon",
		macNote: "If macOS blocks the app, right-click it and choose Open.",
		unavailable: "Not available",
		useWeb: "Use web version",
		version: "Version {{version}}",
		windowsRequirement: "64-bit Windows 10+",
		windowsNote: "If SmartScreen appears, choose More info → Run anyway.",
		platforms: { macos: "macOS", windows: "Windows", android: "Android", ios: "iOS", web: "Web" },
		apps: {
			wechat: "WeChat",
			qq: "QQ",
			weibo: "Weibo",
			dingtalk: "DingTalk",
			alipay: "Alipay",
			lark: "Lark",
			feishu: "Feishu",
		},
	},

	nav: {
		chat: "Chat",
		messages: "Messages",
		tasks: "Tasks",
		memory: "Memory",
		me: "Me",
		mainConversation: "Main conversation",
		backToMain: "Main conversation",
		collapseChat: "Collapse the chat pane",
		expandChat: "Expand the chat pane",
		resizeChat: "Resize the chat pane",
		showList: "Show the list",
		hideList: "Hide the list",
		resizeList: "Resize the list",
		tabs: "Main navigation",
	},

	messages: {
		title: "Messages",
		pinned: "Pinned",
		newConversation: "New conversation",
		myBot: "My Bot",
	},

	common: {
		notBuiltYet: "Not built yet",
		notBuiltYetBody: "{{feature}} arrives in a later step. Nothing is shown here until it works.",
		empty: "Nothing here yet",
		language: "Language",
		appearance: "Appearance",
		theme: {
			system: "Follow system",
			light: "Light",
			dark: "Dark",
		},
		locale: {
			zhCN: "中文",
			en: "English",
		},
	},

	dev: {
		title: "Components",
		theme: "Theme",
		width: "Preview width",
		phone: "Phone · 390 px",
		desktop: "Desktop",
		baseline: "Baseline grid",
		interact: "Hover, pressed and focus styles are shown for comparison. Controls remain interactive.",
		notApplicable: "Not applicable",
		row: "{{variant}} · {{size}}",
		value: "{{value}}",
		colors: "Colors and contrast against page background",
		contrast: "{{ratio}}:1 against background",
		type: "Type scale",
		radii: "Radii",
		spacing: "Spacing",
		shadows: "Shadows",
		motion: "Motion durations",
		states: {
			default: "Default",
			hover: "Hover",
			active: "Pressed",
			focus: "Focus",
			disabled: "Disabled",
			loading: "Loading",
			error: "Error",
		},
		sizes: { sm: "Small · 32", md: "Medium · 40", lg: "Large · 48", fixed: "Fixed" },
		variants: {
			primary: "Primary",
			secondary: "Secondary",
			ghost: "Ghost",
			danger: "Danger",
			link: "Link",
			checked: "Checked",
			unchecked: "Unchecked",
			person: "Person",
			bot: "Bot",
			plain: "Plain",
			action: "Action",
		},
		components: {
			button: "Button",
			iconButton: "IconButton",
			checkbox: "Checkbox",
			segmented: "Segmented",
			inputFrame: "InputFrame",
			textField: "TextField",
			phoneField: "PhoneField",
			passwordField: "PasswordField",
			codeField: "CodeField",
			selectField: "SelectField",
			listbox: "Popover / Listbox",
			avatar: "Avatar",
			emptyState: "EmptyState",
		},
		sample: {
			button: "Button",
			label: "Label",
			phone: "138 0000 0000",
			country: "Country code",
			optionOne: "Option one",
			optionTwo: "Option two",
			type: "The quick brown fox · 中文排版",
			error: "Check this field",
			open: "Open",
			icon: "Icon button",
		},
	},

	chat: {
		emptyTitle: "No messages yet",
		composerPlaceholder: "Message your Bot",
		composerTo: "Message {{name}}",
		attach: "Attach",
		disabledSend: "Send",
		stop: "Stop generating",
		streaming: "Responding…",
		reconnecting: "Connection lost. Reconnecting.",
		reconnectingReply: "Connection lost. Reconnecting; response status is unknown.",
		sending: "Sending…",
		sendFailed: "Message not sent",
		runFailed: "The response failed",
		modelNotConfigured: "No model configured",
		quotaExhausted: "Your quota is exhausted. You can still chat.",
		loadingHistory: "Loading messages…",
		loadOlder: "Load earlier messages",
	},

	tasks: {
		title: "Tasks",
		scheduled: "Scheduled",
		emptyTitle: "No tasks yet",
		emptyScheduled: "No scheduled tasks yet",
	},

	memory: {
		title: "Memory",
		aboutMe: "About me",
		files: "Files",
		emptyTitle: "No memory yet",
	},

	me: accountMessagesEn.me,

	models: modelMessagesEn,

	profile: accountMessagesEn.profile,

	auth: accountMessagesEn.auth,

	errors: {
		invalid_request: "That request was not valid.",
		unauthenticated: "Please sign in.",
		token_expired: "Your session expired. Signing you in again…",
		forbidden: "You do not have access to that.",
		account_suspended: "This account is suspended.",
		account_pending_deletion: "This account is scheduled for deletion.",
		not_found: "Not found.",
		conflict_version: "That changed somewhere else. Reload and try again.",
		code_invalid: "That code is not right.",
		code_expired: "That code has expired.",
		code_rate_limited: "Please wait before asking for another code.",
		password_invalid: "That password is not right.",
		password_missing: "A password is required.",
		password_not_set: "This account has no password yet.",
		session_revoked: "You were signed out on another device.",
		refresh_reused: "Your session ended for security. Please sign in again.",
		upload_invalid: "That file cannot be used as an avatar.",
		rate_limited: "Too many attempts. Try again later.",
		internal: "Something went wrong on our side.",
		sms_not_configured: "This server cannot send SMS yet.",
		upstream_unavailable: "The provider could not be reached.",
	},

	notFound: {
		title: "This page does not exist",
		body: "The link may be old, or the address may have a typo.",
		goHome: "Go to the app",
	},
} as const;

/**
 * The same shape with the literal types widened to `string`. The English table stays `as const` so
 * its keys are checkable; the widened type is what another language must match.
 */
type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof en>;
