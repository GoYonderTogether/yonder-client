import { SidePageActions } from "@yonder/ui-shell";
import { ICON_SIZE } from "@yonder/ui-tokens";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";

/** A route action lives in the desktop title bar and stays inline at its call site elsewhere. */
export function DetailLinkAction({ to, label, replace = false }: { to: string; label: string; replace?: boolean }) {
	return (
		<SidePageActions placement="title">
			<Link
				to={to}
				replace={replace}
				aria-label={label}
				title={label}
				className="grid size-[var(--control-sm)] shrink-0 place-items-center rounded-[var(--radius-control-sm)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
			>
				<ArrowUpRight size={ICON_SIZE.md} aria-hidden="true" />
			</Link>
		</SidePageActions>
	);
}
