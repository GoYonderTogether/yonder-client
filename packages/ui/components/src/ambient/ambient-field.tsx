import { type CSSProperties, useEffect, useState } from "react";
import { cn } from "../cn.ts";
import "./ambient-field.css";
import { StarTrails } from "./vendor/star-trails.tsx";
import { SunBlinds } from "./vendor/sun-blinds.tsx";

export interface AmbientFieldProps {
	/**
	 * How much of the page colour is laid over the effect, 0 to 1. The effect should read as a faint
	 * blur on the ground, never as content, so the default hides most of it.
	 */
	veil?: { light: number; dark: number } | undefined;
	className?: string | undefined;
}

export const DEFAULT_VEIL = { light: 0.9, dark: 0.55 } as const;

/** The effects need WebGL-era browser APIs; a host without them (a test DOM, an old webview) gets the flat page. */
const canDraw = () =>
	typeof window !== "undefined" &&
	typeof window.matchMedia === "function" &&
	typeof ResizeObserver === "function" &&
	typeof IntersectionObserver === "function";

const isDark = () => document.documentElement.dataset.theme === "dark";

/** The page's own light or dark setting; follows `data-theme` on the root element. */
function useDarkTheme(): boolean {
	const [dark, setDark] = useState(isDark);
	useEffect(() => {
		const observer = new MutationObserver(() => setDark(isDark()));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
		setDark(isDark());
		return () => observer.disconnect();
	}, []);
	return dark;
}

/**
 * A fixed background layer for pages with little content (sign-in, setup, the landing page): window
 * light in the day theme, star trails at night. Both are WebGL shaders from beste-ui (MIT, see
 * `vendor/SOURCE`); without WebGL each draws its own flat colour. It never takes pointer events and
 * pauses off screen, in hidden tabs and under reduced motion.
 */
export function AmbientField({ veil = DEFAULT_VEIL, className }: AmbientFieldProps) {
	const dark = useDarkTheme();
	if (!canDraw()) return null;
	return (
		<div
			aria-hidden="true"
			className={cn("ambient-field", className)}
			style={{ "--ambient-veil": String(dark ? veil.dark : veil.light) } as CSSProperties}
		>
			{dark ? (
				<StarTrails
					className="ambient-layer"
					skyColor="#05060a"
					glowColor="#1b1d24"
					horizonColor="#4a4f5c"
					landColor="#010203"
					stars={0.6}
					horizon={0.2}
					interactive
				/>
			) : (
				<SunBlinds
					className="ambient-layer"
					wallColor="#e6e8ec"
					lightColor="#ffffff"
					dust={0.35}
					follow={0.9}
					interactive
				/>
			)}
		</div>
	);
}
