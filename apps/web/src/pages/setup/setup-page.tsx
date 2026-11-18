import { AuthLayout, ProfileSetupForm } from "@yonder/feature-auth";
import { ConnectorSetup, useSetupConnectors } from "@yonder/feature-me";
import { BotForm } from "@yonder/feature-members";
import { Button, IconButton } from "@yonder/ui-components";
import { keys, useApi, useBot, useDataQueryClient, usePerson } from "@yonder/ui-data";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "react-router";
import { useLocalFilesAdapter } from "../../lib/local-files.ts";
import {
	isSetupStep,
	nextStep,
	previousStep,
	SETUP_STEPS,
	type SetupStep,
	setupPath,
	stepsFor,
} from "./setup-steps.ts";

/**
 * `/setup/:step`. After an account is created: who the Bot should call you, a name for your Bot,
 * and what to connect (18 新用户引导). Every step can be left for later and each stays editable in
 * 「我」. Connecting is offered only where something can be connected, and it is the last step, so
 * its button is the one that opens the app.
 */
export function SetupPage() {
	const { step } = useParams();
	const { t } = useTranslation();
	const navigate = useNavigate();
	const api = useApi();
	const client = useDataQueryClient();
	const [completion, setCompletion] = useState<"idle" | "pending" | "error">("idle");
	const [skippedSteps, setSkippedSteps] = useState<SetupStep[]>([]);
	const connectable = useSetupConnectors();
	const canConnect = connectable.loading || connectable.definitions.length > 0;
	if (!isSetupStep(step)) return <Navigate to={setupPath(SETUP_STEPS[0])} replace />;
	// A device that cannot connect anything never lands on that step, even from an old address.
	if (step === "connect" && !canConnect) return <Navigate to={setupPath("bot")} replace />;

	const go = (target: SetupStep) => navigate(setupPath(target), { replace: true });
	const finish = async (skipped = skippedSteps) => {
		setCompletion("pending");
		try {
			const { conversationId } = await api.completeOnboarding(skipped);
			await Promise.all([
				client.invalidateQueries({ queryKey: keys.conversations.all() }),
				client.invalidateQueries({ queryKey: keys.messages.latest(conversationId) }),
			]);
			navigate(`/messages/${encodeURIComponent(conversationId)}`, { replace: true });
		} catch {
			setCompletion("error");
		}
	};
	const forward = (skipped: boolean) => {
		const completedSteps = skippedSteps.filter((item) => item !== step);
		if (skipped) completedSteps.push(step);
		setSkippedSteps(completedSteps);
		const next = nextStep(step, canConnect);
		if (next) go(next);
		else void finish(completedSteps);
	};
	const back = previousStep(step, canConnect);
	const steps = stepsFor(canConnect);

	return (
		<AuthLayout>
			<div className="flex w-full max-w-[400px] flex-col gap-[var(--spacing-6)]">
				<div className="flex items-center justify-between">
					<IconButton
						size="sm"
						aria-label={t("app.back")}
						onClick={() => back && go(back)}
						className={back ? undefined : "invisible"}
						disabled={!back || completion === "pending"}
					>
						<ChevronLeft size={20} aria-hidden="true" />
					</IconButton>
					<ol className="flex items-center gap-[var(--spacing-2)]" aria-label={t("setup.progress")}>
						{steps.map((item, index) => (
							<li
								key={item}
								aria-current={item === step ? "step" : undefined}
								className={[
									"h-[6px] rounded-full transition-[width,background-color] duration-[var(--duration-slow)]",
									item === step
										? "w-[20px] bg-[var(--color-accent)]"
										: index < steps.indexOf(step)
											? "w-[6px] bg-[var(--color-text-primary)]"
											: "w-[6px] bg-[var(--color-border-strong)]",
								].join(" ")}
							/>
						))}
					</ol>
					<span className="size-[var(--control-sm)]" aria-hidden="true" />
				</div>
				<fieldset disabled={completion === "pending"} className="flex min-w-0 flex-col gap-[var(--spacing-6)]">
					{step === "you" ? <YouStep onDone={forward} /> : null}
					{step === "bot" ? <BotStep onDone={forward} /> : null}
					{step === "connect" ? <ConnectStep onDone={forward} /> : null}
					{completion === "error" ? (
						<div role="alert">
							<p>{t("setup.finishFailed")}</p>
							<Button type="button" onClick={() => void finish()}>
								{t("app.retry")}
							</Button>
						</div>
					) : null}
				</fieldset>
			</div>
		</AuthLayout>
	);
}

/** Who the Bot should call you; the profile form already knows how to save a name and a picture. */
function YouStep({ onDone }: { onDone: (skipped: boolean) => void }) {
	const { t } = useTranslation();
	const person = usePerson();
	return (
		<ProfileSetupForm
			currentName={person?.displayName ?? ""}
			currentAvatarUrl={person?.avatarUrl ?? null}
			handle={person?.handle ?? ""}
			submitLabel={t("app.continue")}
			onDone={() => onDone(false)}
			onSkip={() => onDone(true)}
		/>
	);
}

/** The Bot every account starts with, named in the Bot form's own edit mode (15 第二节第 1 条). */
function BotStep({ onDone }: { onDone: (skipped: boolean) => void }) {
	const { t } = useTranslation();
	const bot = useBot();
	if (!bot) return null;
	return (
		<>
			<h1 className="text-h1 text-[var(--color-text-primary)]">{t("setup.botTitle")}</h1>
			<div className="-mx-[var(--spacing-6)] -my-[var(--spacing-6)]">
				<BotForm mode="edit" bot={bot} onSaved={() => onDone(false)} />
			</div>
			<Button type="button" variant="ghost" size="lg" onClick={() => onDone(true)}>
				{t("app.skipStep")}
			</Button>
		</>
	);
}

/** What this device can connect, as the connectors page's own cards; the last step opens the app. */
function ConnectStep({ onDone }: { onDone: (skipped: boolean) => void }) {
	const { t } = useTranslation();
	const localFiles = useLocalFilesAdapter();
	const { instances } = useSetupConnectors();
	return (
		<>
			<h1 className="text-h1 text-[var(--color-text-primary)]">{t("setup.connectTitle")}</h1>
			<ConnectorSetup localFiles={localFiles} />
			<Button
				type="button"
				variant={instances.length > 0 ? "primary" : "secondary"}
				size="lg"
				block
				onClick={() => onDone(instances.length === 0)}
			>
				{instances.length > 0 ? t("setup.start") : t("app.skip")}
			</Button>
		</>
	);
}
