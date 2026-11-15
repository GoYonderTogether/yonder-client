import { AuthLayout, ProfileSetupForm } from "@yonder/feature-auth";
import { usePerson } from "@yonder/ui-data";
import { useNavigate } from "react-router";

/**
 * The second optional step: a name and an avatar. Both can be skipped, and both remain editable in
 * 「我」 afterwards.
 */
export function SetupProfilePage() {
	const navigate = useNavigate();
	const person = usePerson();
	const finish = () => navigate("/messages", { replace: true });

	return (
		<AuthLayout>
			<ProfileSetupForm
				currentName={person?.displayName ?? ""}
				currentAvatarUrl={person?.avatarUrl ?? null}
				handle={person?.handle ?? ""}
				onDone={finish}
				onSkip={finish}
			/>
		</AuthLayout>
	);
}
