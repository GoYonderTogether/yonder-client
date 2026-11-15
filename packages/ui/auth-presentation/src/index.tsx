import "./styles.css";
import type { ComponentType, ReactNode } from "react";

export type AuthHost = ComponentType<{ className?: string; children?: ReactNode }> | "div" | "main" | "h1";
type Props = { as: AuthHost; children: ReactNode };

export function AuthFrame({ as: Element, locale, brand, children }: Props & { locale: ReactNode; brand: ReactNode }) {
	return (
		<Element className="auth-frame">
			<Element className="auth-locale">{locale}</Element>
			<Element className="auth-column">
				<Element className="auth-brand">{brand}</Element>
				{children}
			</Element>
		</Element>
	);
}
export function AuthTitle({ as: Element, children }: Props) {
	return <Element className="auth-title">{children}</Element>;
}
export function AuthStack({ as: Element, children }: Props) {
	return <Element className="auth-stack">{children}</Element>;
}
export function AuthConsent({ as: Element, children }: Props) {
	return <Element className="auth-consent">{children}</Element>;
}
export function AuthActions({ as: Element, children }: Props) {
	return <Element className="auth-actions">{children}</Element>;
}
