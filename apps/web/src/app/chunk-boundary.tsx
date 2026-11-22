import { Button } from "@yonder/ui-components";
import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { reportNavigationFailure } from "../lib/internal-errors.ts";

/** Keeps a failed lazy view from replacing the rest of the app and its drafts. */
export class ChunkBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	componentDidCatch() {
		reportNavigationFailure();
	}
	componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey: string }>) {
		if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
	}
	render() {
		return this.state.failed ? <ChunkError /> : this.props.children;
	}
}

function ChunkError() {
	const { t } = useTranslation();
	return (
		<div role="alert" className="p-[var(--spacing-4)]">
			<p>{t("app.loadFailed")}</p>
			<Button
				variant="link"
				onClick={() => {
					if (window.confirm(t("app.reloadConfirm"))) window.location.reload();
				}}
			>
				{t("app.reload")}
			</Button>
		</div>
	);
}
