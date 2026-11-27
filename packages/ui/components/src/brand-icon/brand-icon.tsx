import feishu from "./feishu.png";
import qq from "./qq.png";
import wechat from "./wechat.png";

/**
 * The built-in brand icon library. A third-party brand (WeChat, Feishu, QQ) is always drawn with its
 * own app's official icon, never a generic one and never a hand-drawn copy. Callers ask for a brand
 * by name, so a page or the AI never has to look an icon up again. Each file is the icon bundled in
 * that brand's own app, scaled to 128px. A new brand is one file and one line in `SOURCES`.
 */
const SOURCES = { wechat, qq, feishu } as const;

export type BrandName = keyof typeof SOURCES;

/** Every brand the library holds, for pickers and for telling the AI what it may name. */
export const BRAND_NAMES = Object.keys(SOURCES) as BrandName[];

export interface BrandIconProps {
	name: BrandName;
	size?: number;
	/** The brand's name in the reader's language. Without it the icon is decorative and hidden from readers. */
	title?: string;
	className?: string;
}

export function BrandIcon({ name, size = 28, title, className }: BrandIconProps) {
	return (
		<img
			src={SOURCES[name]}
			width={size}
			height={size}
			alt={title ?? ""}
			aria-hidden={title ? undefined : true}
			draggable={false}
			className={`shrink-0 rounded-[var(--radius-control-sm)] ${className ?? ""}`.trim()}
		/>
	);
}
