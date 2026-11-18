import { AuthLayout, ProfileSetupForm } from "@yonder/feature-auth";
import { ConnectorSetup, useSetupConnectors } from "@yonder/feature-me";
import { BotForm } from "@yonder/feature-members";
import { Button, IconButton } from "@yonder/ui-components";
import { useBot, usePerson } from "@yonder/ui-data";
import { ChevronLeft } from "lucide-react";
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
	const connectable = useSetupConnectors();
	const canConnect = connectable.loading || connectable.definitions.length > 0;
	if (!isSetupStep(step)) return <Navigate to={setupPath(SETUP_STEPS[0])} replace />;
	// A device that cannot connect anything never lands on that step, even from an old address.
	if (step === "connect" && !canConnect) return <Navigate to="/messages" replace />;

	const go = (target: SetupStep | null) => navigate(target ? setupPath(target) : "/messages", { replace: true });
	const forward = () => go(nextStep(step, canConnect));
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
						disabled={!back}
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
				{step === "you" ? <YouStep onDone={forward} /> : null}
				{step === "bot" ? <BotStep onDone={forward} /> : null}
				{step === "connect" ? <ConnectStep onDone={forward} /> : null}
			</div>
		</AuthLayout>
	);
}

/** Who the Bot should call you; the profile form already knows how to save a name and a picture. */
function YouStep({ onDone }: { onDone: () => void }) {
	const { t } = useTranslation();
	const person = usePerson();
	return (
		<ProfileSetupForm
			currentName={person?.displayName ?? ""}
			currentAvatarUrl={person?.avatarUrl ?? null}
			handle={person?.handle ?? ""}
			submitLabel={t("app.continue")}
			onDone={onDone}
			onSkip={onDone}
		/>
	);
}

/** The Bot every account starts with, named in the Bot form's own edit mode (15 第二节第 1 条). */
function BotStep({ onDone }: { onDone: () => void }) {
	const { t } = useTranslation();
	const bot = useBot();
	if (!bot) return null;
	return (
		<>
			<h1 className="text-h1 text-[var(--color-text-primary)]">{t("setup.botTitle")}</h1>
			<div className="-mx-[var(--spacing-6)] -my-[var(--spacing-6)]">
				<BotForm mode="edit" bot={bot} onSaved={onDone} />
			</div>
			<Button type="button" variant="ghost" size="lg" onClick={onDone}>
				{t("app.skipStep")}
			</Button>
		</>
	);
}

/** What this device can connect, as the connectors page's own cards; the last step opens the app. */
function ConnectStep({ onDone }: { onDone: () => void }) {
	const { t } = useTranslation();
	const localFiles = useLocalFilesAdapter();
	const { instances } = useSetupConnectors();
	return (
		<>
			<h1 className="text-h1 text-[var(--color-text-primary)]">{t("setup.connectTitle")}</h1>
			<ConnectorSetup localFiles={localFiles} />
			<Button type="button" variant={instances.length > 0 ? "primary" : "secondary"} size="lg" block onClick={onDone}>
				{instances.length > 0 ? t("setup.start") : t("app.skip")}
			</Button>
		</>
	);
}
