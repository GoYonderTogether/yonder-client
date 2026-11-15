import "./logo.css";

export interface LogoProps {
	size: number;
	title?: string;
	/**
	 * `canvas` (default): the kit's 512 canvas, already placed for a square tile; use it inside a
	 * tile or an avatar. `text`: no tile, set beside a word. The mark's box hangs about 10 units
	 * below the canvas centre and its heavy arm is at the top, so beside text it reads low; this
	 * crops to the mark and lifts it about 3% so its optical centre meets the text's.
	 */
	fit?: "canvas" | "text";
}

/** Canvas 512: the mark's box is x 60.6–434.2, y 73.6–457.8 (centre 247.4, 265.7). */
const VIEW_BOX = { canvas: "0 0 512 512", text: "37.4 68.3 420 420" } as const;

/** The selected mark, with the optically corrected reverse for dark themes. */
export function Logo({ size, title, fit = "canvas" }: LogoProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox={VIEW_BOX[fit]}
			role={title ? "img" : undefined}
			aria-label={title}
			aria-hidden={title ? undefined : true}
		>
			<g transform="translate(-21.431590039136083 42.94053913643775) rotate(12 256 256)">
				<path
					className="yonder-logo-master"
					fill="currentColor"
					d="M 350.05859 57.607422 L 256 151.66797 L 173.25391 68.921875 L 105.37305 136.80469 L 196.28516 227.71484 C 203.79965 235.22934 208 245.3729 208 256 L 208 384 L 248 384 L 248 256 C 248 230.54229 258.11587 206.11851 276.11719 188.11719 L 378.34375 85.892578 L 350.05859 57.607422 z M 389.65625 97.207031 L 287.43164 199.43164 C 272.42656 214.43672 264 234.77961 264 256 L 264 384 L 304 384 L 304 256 C 304 245.3729 308.20035 235.22934 315.71484 227.71484 L 417.94141 125.49023 L 389.65625 97.207031 z "
				/>
				<path
					className="yonder-logo-reverse"
					fill="currentColor"
					d="M 351.47266 59.021484 L 256 154.49609 L 171.83984 70.335938 L 106.78711 135.39062 L 197.69922 226.30078 C 205.58824 234.18981 210 244.84323 210 256 L 210 384 L 246 384 L 246 256 C 246 230.01263 256.32728 205.07897 274.70312 186.70312 L 376.92969 84.478516 L 351.47266 59.021484 z M 391.07031 98.621094 L 288.8457 200.8457 C 274.21515 215.47626 266 235.30927 266 256 L 266 384 L 302 384 L 302 256 C 302 244.84323 306.41176 234.18981 314.30078 226.30078 L 416.52734 124.07617 L 391.07031 98.621094 z "
				/>
			</g>
		</svg>
	);
}

/**
 * The app icon as the system draws it in the Dock, on the home screen and in the taskbar: a white
 * rounded square (radius 22.45%, Apple's grid) with the black mark at 85% of the tile. It stays white
 * in dark mode, like every other app icon. Used where the product shows its own icon (关于, the web
 * rail); a bare mark beside a word uses `<Logo fit="text">` instead.
 */
export function AppIcon({ size, title }: { size: number; title?: string }) {
	return (
		<span
			className="yonder-logo-light inline-flex shrink-0 items-center justify-center rounded-[22.45%] bg-[var(--color-app-icon-bg)] text-[var(--color-app-icon-fg)] shadow-[var(--shadow-app-icon)]"
			style={{ width: size, height: size }}
		>
			<Logo size={Math.round(size * 0.85)} {...(title ? { title } : {})} />
		</span>
	);
}
