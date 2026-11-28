/**
 * The brand registry: the one list of third-party apps, platforms and messaging services the app
 * may draw an icon for, shared by the server and every client exactly like the rest of the protocol.
 *
 * An entry exists only for a brand whose own official icon we hold — the three built-ins (wechat,
 * qq, feishu), an app installed on the owner's Mac, or an asset the owner uploaded. A brand with no
 * such source does not enter the registry; the UI shows a neutral icon by `kind` rather than an
 * imitation. Each entry carries a stable `id` (what `BrandIcon` takes and a connector manifest
 * names), the brand's name in Chinese and English, that `kind` (which decides the neutral fallback
 * when no official icon is bundled) and searchable aliases so a lookup never depends on spelling.
 */
export type BrandKind = "im" | "app" | "device" | "platform";

export interface Brand {
	/** Stable id: what `BrandIcon` takes and a connector manifest names. Never a display name. */
	readonly id: string;
	readonly name: { readonly zh: string; readonly en: string };
	/** Decides the neutral icon shown when this brand has no bundled official icon. */
	readonly kind: BrandKind;
	/** Other names a page or the model may use for this brand. */
	readonly aliases: readonly string[];
}

/**
 * The registry, in display order: messaging first, then the Apple apps, then other installed apps.
 * Icons for these live in the app (`packages/ui/components/src/brand-icon/`); an id without a
 * bundled icon falls back to the neutral icon for its `kind`.
 */
export const BRANDS = [
	{
		id: "wechat",
		name: { zh: "微信", en: "WeChat" },
		kind: "im",
		aliases: ["微信", "WeChat", "weixin", "WeChat iLink", "iLink"],
	},
	{
		id: "qq",
		name: { zh: "QQ", en: "QQ" },
		kind: "im",
		aliases: ["QQ", "qq"],
	},
	{
		id: "feishu",
		name: { zh: "飞书", en: "Feishu" },
		kind: "im",
		aliases: ["飞书", "Feishu", "Lark 中国版"],
	},
	{
		id: "lark",
		name: { zh: "Lark", en: "Lark" },
		kind: "im",
		aliases: ["Lark", "飞书国际版"],
	},
	{
		id: "apple-calendar",
		name: { zh: "日历", en: "Calendar" },
		kind: "app",
		aliases: ["日历", "Calendar", "Apple Calendar"],
	},
	{
		id: "apple-photos",
		name: { zh: "照片", en: "Photos" },
		kind: "app",
		aliases: ["照片", "相册", "Photos", "Apple Photos"],
	},
	{
		id: "apple-notes",
		name: { zh: "备忘录", en: "Notes" },
		kind: "app",
		aliases: ["备忘录", "Notes", "Apple Notes"],
	},
	{
		id: "apple-voice-memos",
		name: { zh: "语音备忘录", en: "Voice Memos" },
		kind: "app",
		aliases: ["语音备忘录", "录音", "Voice Memos"],
	},
	{
		id: "apple-messages",
		name: { zh: "信息", en: "Messages" },
		kind: "app",
		aliases: ["信息", "iMessage", "Messages"],
	},
	{
		id: "apple-phone",
		name: { zh: "电话", en: "Phone" },
		kind: "app",
		aliases: ["电话", "Phone", "FaceTime"],
	},
	{
		id: "tencent-meeting",
		name: { zh: "腾讯会议", en: "Tencent Meeting" },
		kind: "app",
		aliases: ["腾讯会议", "Tencent Meeting", "VooV Meeting"],
	},
] as const satisfies readonly Brand[];

/** Every brand id the app may name. */
export type BrandId = (typeof BRANDS)[number]["id"];
