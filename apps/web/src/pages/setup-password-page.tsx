import { AuthLayout, PasswordSetupForm } from "@yonder/feature-auth";
import { useNavigate } from "react-router";

/**
 * The first optional step after a new account is created: set a password, or skip it. Either way
 * the next step is the profile one.
 */
export function SetupPasswordPage() {
	const navigate = useNavigate();
	return (
		<AuthLayout>
			<PasswordSetupForm
				onDone={() => navigate("/setup/profile", { replace: true })}
				onSkip={() => navigate("/setup/profile", { replace: true })}
			/>
		</AuthLayout>
	);
}
