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
	interactive = false,
	className,
}: AvatarProps) {
	const initial = firstCharacter(name);
	// A Bot without its own picture is an ink tile with a face: it reads as a character, not a person.
	const tint =
		kind === "bot"
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
				<img src={src} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
			) : kind === "bot" ? (
				<BotFace id={face} size={size} />
			) : (
				initial
			)}
		</span>
	);
}

function firstCharacter(name: string): string {
	const trimmed = name.trim();
	return trimmed === "" ? "?" : ([...trimmed][0] as string).toUpperCase();
}

/**
 * Six muted tints, defined as tokens so no colour literal lives in a component. Fixed, not random:
 * the same name must get the same colour on every device, and these are neutral enough not to
 * compete with the accent.
 */
const TINTS = [
	["var(--color-avatar-1-bg)", "var(--color-avatar-1-fg)"],
	["var(--color-avatar-2-bg)", "var(--color-avatar-2-fg)"],
	["var(--color-avatar-3-bg)", "var(--color-avatar-3-fg)"],
	["var(--color-avatar-4-bg)", "var(--color-avatar-4-fg)"],
	["var(--color-avatar-5-bg)", "var(--color-avatar-5-fg)"],
	["var(--color-avatar-6-bg)", "var(--color-avatar-6-fg)"],
] as const;

function tintFor(name: string): { background: string; foreground: string } {
	let hash = 0;
	for (const character of name) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 997;
	const [background, foreground] = TINTS[hash % TINTS.length] as readonly [string, string];
	return { background, foreground };
}
