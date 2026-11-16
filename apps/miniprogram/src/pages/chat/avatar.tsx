import { Image, Text, View } from "@tarojs/components";
import { botFacePaths, firstCharacter, tintFor } from "@yonder/chat-model";

const face = botFacePaths(1);
const maskImage = `url("data:image/svg+xml,${encodeURIComponent(
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="white" transform="${face.transform}"><path d="${face.left}"/><path d="${face.right}"/></g></svg>`,
)}")`;

export function ChatAvatar({
	name,
	kind,
	src,
	color,
	size = 32,
}: {
	name: string;
	kind: "person" | "bot";
	src?: string | null;
	color?: string | null;
	size?: number;
}) {
	const tint =
		color && /^[1-6]$/.test(color)
			? { background: `var(--color-avatar-${color}-bg)`, foreground: `var(--color-avatar-${color}-fg)` }
			: kind === "bot"
				? { background: "var(--color-avatar-bot-bg)", foreground: "var(--color-avatar-bot-fg)" }
				: tintFor(name);
	return (
		<View
			className={`mini-chat-avatar mini-chat-avatar-${kind}`}
			style={{ width: `${size}px`, height: `${size}px`, backgroundColor: tint.background, color: tint.foreground }}
		>
			{src ? (
				<Image className="mini-chat-avatar-image" src={src} mode="aspectFill" />
			) : kind === "bot" ? (
				<View
					className="mini-chat-avatar-bot-face"
					style={{ backgroundColor: tint.foreground, maskImage, WebkitMaskImage: maskImage }}
				/>
			) : (
				<Text className="mini-chat-avatar-initial">{firstCharacter(name)}</Text>
			)}
		</View>
	);
}
