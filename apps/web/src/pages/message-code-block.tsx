import { Check, Copy } from "lucide-react";
import type { HTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function MessageCodeBlock({ children, ...props }: HTMLAttributes<HTMLPreElement>) {
	const { t } = useTranslation();
	const pre = useRef<HTMLPreElement>(null);
	const [copied, setCopied] = useState(false);
	const [failed, setFailed] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			clearTimeout(timer.current);
		};
	}, []);
	async function copy() {
		try {
			await navigator.clipboard.writeText(pre.current?.textContent ?? "");
			if (!mounted.current) return;
			setCopied(true);
			setFailed(false);
			clearTimeout(timer.current);
			timer.current = setTimeout(() => setCopied(false), 2500);
		} catch {
			if (mounted.current) {
				clearTimeout(timer.current);
				setCopied(false);
				setFailed(true);
			}
		}
	}
	return (
		<div className="message-code-block message-content-block">
			<button
				type="button"
				className="message-copy"
				aria-label={t(copied ? "app.copied" : "app.copy")}
				onClick={() => void copy()}
			>
				<Copy size={16} aria-hidden="true" className={copied ? "copy-original is-hidden" : "copy-original"} />
				<span className={copied ? "copy-success is-visible" : "copy-success"}>
					<Check size={16} aria-hidden="true" />
				</span>
			</button>
			{failed ? (
				<span role="alert" className="text-caption text-[var(--color-danger)]">
					{t("landing.copyFailed")}
				</span>
			) : null}
			<pre {...props} ref={pre} className={`message-code-scroll ${props.className ?? ""}`}>
				{children}
			</pre>
		</div>
	);
}
