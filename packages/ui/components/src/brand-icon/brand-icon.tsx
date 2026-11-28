import { BRANDS, type BrandId, type BrandKind } from "@yonder/protocol";
import { AppWindow, Globe, MessageCircle, Smartphone } from "lucide-react";
import appleCalendar from "./apple-calendar.png";
import appleMessages from "./apple-messages.png";
import appleNotes from "./apple-notes.png";
import applePhone from "./apple-phone.png";
import applePhotos from "./apple-photos.png";
import appleVoiceMemos from "./apple-voice-memos.png";
import feishu from "./feishu.png";
import lark from "./lark.png";
import qq from "./qq.png";
import tencentMeeting from "./tencent-meeting.png";
import wechat from "./wechat.png";

/**
 * Official icons we hold, keyed by a registry `id` (`BRANDS`). Each file is the icon bundled in that
 * brand's own app, scaled to 128px — never a hand-drawn copy, never one brand's icon standing in for
 * another. A registry id with no file here is not faked: `BrandIcon` falls back to the neutral icon
 * for that brand's `kind`. Adding a brand is one sourced file and one line here.
 */
const ICONS: Partial<Record<BrandId, string>> = {
	wechat,
	qq,
	feishu,
	lark,
	"apple-calendar": appleCalendar,
	"apple-photos": applePhotos,
	"apple-notes": appleNotes,
	"apple-voice-memos": appleVoiceMemos,
	"apple-messages": appleMessages,
	"apple-phone": applePhone,
	"tencent-meeting": tencentMeeting,
};

/** The neutral icon a brand falls back to by `kind` when its own official icon is not bundled. */
const KIND_ICONS: Record<BrandKind, typeof MessageCircle> = {
	im: MessageCircle,
	app: AppWindow,
	device: Smartphone,
	platform: Globe,
};

const KIND_BY_ID = new Map<string, BrandKind>(BRANDS.map((brand) => [brand.id, brand.kind]));

export interface BrandIconProps {
	/** A registry id (`BRANDS`). An id not in the registry draws the `kind: platform` neutral icon. */
	name: BrandId | (string & {});
	size?: number;
	/** The brand's name in the reader's language. Without it the icon is decorative and hidden from readers. */
	title?: string;
	className?: string;
}

export function BrandIcon({ name, size = 28, title, className }: BrandIconProps) {
	const src = ICONS[name as BrandId];
	if (src) {
		return (
			<img
				src={src}
				width={size}
				height={size}
				alt={title ?? ""}
				aria-hidden={title ? undefined : true}
				draggable={false}
				className={`shrink-0 rounded-[var(--radius-control-sm)] ${className ?? ""}`.trim()}
			/>
		);
	}
	const Icon = KIND_ICONS[KIND_BY_ID.get(name) ?? "platform"];
	return (
		<span
			{...(title ? { role: "img" as const, "aria-label": title } : { "aria-hidden": true as const })}
			className={`grid shrink-0 place-items-center text-[var(--color-text-secondary)] ${className ?? ""}`.trim()}
			style={{ width: size, height: size }}
		>
			<Icon aria-hidden className="size-full" />
		</span>
	);
}
