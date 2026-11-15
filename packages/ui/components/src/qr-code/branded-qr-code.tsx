import { QRCodeSVG } from "qrcode.react";
import { Logo } from "../logo/logo.tsx";

export interface BrandedQrCodeProps {
	value: string;
	label: string;
	size?: number;
}

/** Every shareable code uses the same quiet zone, high correction and centered product mark. */
export function BrandedQrCode({ value, label, size = 200 }: BrandedQrCodeProps) {
	const mark = size * 0.18;
	const inset = (size - mark) / 2;
	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			role="img"
			aria-label={label}
			className="yonder-logo-light max-w-full text-[var(--color-app-icon-fg)]"
			style={{ height: "auto" }}
		>
			<title>{label}</title>
			<QRCodeSVG
				value={value}
				size={size}
				level="H"
				marginSize={4}
				bgColor="var(--color-app-icon-bg)"
				fgColor="var(--color-app-icon-fg)"
				aria-hidden="true"
			/>
			<g transform={`translate(${inset} ${inset})`}>
				<rect width={mark} height={mark} rx={mark / 5} fill="var(--color-app-icon-bg)" />
				<g transform={`translate(${mark * 0.08} ${mark * 0.08})`}>
					<Logo size={mark * 0.84} />
				</g>
			</g>
		</svg>
	);
}
