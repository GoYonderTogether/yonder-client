import { firstCharacter, tintFor } from "@yonder/chat-model";
import { cn } from "../cn.ts";
import { BotFace, type BotFaceId } from "./bot-face.tsx";

export type AvatarSize = 16 | 24 | 28 | 32 | 36 | 40 | 48 | 64 | 80;

export interface AvatarProps {
	/** The person's or Bot's display name; people fall back to its first character. */
	name: string;
	/** Content-addressed URL; when it changes, the cache is bypassed because the URL changed. */
	src?: string | null | undefined;
	size?: AvatarSize;
	/** A Bot is a rounded square, a person a circle, so they are distinguishable at a glance. */
	kind?: "person" | "bot" | undefined;
	/** Which default face a Bot without a picture shows; the main Bot is 1. */
	face?: BotFaceId | undefined;
	color?: string | null | undefined;
	/** Adds a ring, used when the avatar is the trigger for a menu. */
	interactive?: boolean | undefined;
	className?: string;
}

const PIXELS: Record<AvatarSize, string> = {
	16: "size-4 text-[8px]",
	24: "size-6 text-[10px]",
	28: "size-7 text-micro",
	32: "size-8 text-caption",
	36: "size-9 text-caption",
	40: "size-10 text-body",
	48: "size-12 text-h3",
	64: "size-16 text-h2",
	80: "size-20 text-h1",
};

/**
 * A person or a Bot. Without an image people show their initial on a stable colour derived from
 * the name; Bots show their face (two flat-topped eyes, `bot-face.tsx`).
 */
export function Avatar({
	name,
	src,
	size = 32,
	kind = "person",
	face = 1,
	color,
	interactive = false,
	className,
}: AvatarProps) {
	const initial = firstCharacter(name);
	// A Bot without its own picture is an ink tile with a face: it reads as a character, not a person.
	const tint =
		color && /^[1-6]$/.test(color)
			? { background: `var(--color-avatar-${color}-bg)`, foreground: `var(--color-avatar-${color}-fg)` }
			: kind === "bot"
				? { background: "var(--color-avatar-bot-bg)", foreground: "var(--color-avatar-bot-fg)" }
				: tintFor(name);
	return (
		<span
			className={cn(
				"relative inline-flex shrink-0 items-center justify-center overflow-hidden",
				// People are round; a Bot is a rounded square, the way apps and assistants are drawn.
				kind === "bot" ? "rounded-[30%]" : "rounded-full",
				"select-none font-semibold",
				PIXELS[size],
				interactive &&
					"ring-2 ring-transparent transition-shadow duration-[var(--duration-fast)] hover:ring-[var(--color-border-strong)]",
				className,
			)}
			style={src ? undefined : { backgroundColor: tint.background, color: tint.foreground }}
			aria-hidden="true"
			data-avatar-fallback={src ? undefined : "true"}
		>
			{src ? (
				<img src={src} alt="" className="size-full object-cover" loading="lazy" decoding="async" draggable={false} />
			) : kind === "bot" ? (
				<BotFace id={face} size={size} />
			) : (
				initial
			)}
		</span>
	);
}
