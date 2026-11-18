// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ConnectorDefinition, Member } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";

const world = vi.hoisted(() => ({
	definitions: [] as ConnectorDefinition[],
	updateMe: vi.fn(),
	updateBot: vi.fn(),
	completeOnboarding: vi.fn(),
	invalidateQueries: vi.fn(),
}));

const person: Member = {
	id: "me",
	kind: "person",
	handle: "p_one",
	displayName: "p_one",
	avatarUrl: null,
	bio: null,
	ownerId: null,
	isDefault: false,
	createdAt: "2026-11-17T00:00:00Z",
	version: 1,
};
const bot: Member = {
	...person,
	id: "bot",
	kind: "bot",
	handle: "b_one",
	displayName: "Yonder",
	ownerId: "me",
	isDefault: true,
};

vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	usePerson: () => person,
	useApi: () => ({ completeOnboarding: world.completeOnboarding }),
	useDataQueryClient: () => ({ invalidateQueries: world.invalidateQueries }),
	useBot: () => bot,
	useUpdateMe: () => ({ mutateAsync: world.updateMe, isPending: false }),
	useUploadAvatar: () => ({ mutateAsync: vi.fn(), isPending: false }),
	useUpdateBot: () => ({ mutateAsync: world.updateBot }),
	useUploadBotAvatar: () => ({ mutateAsync: vi.fn() }),
	useContactActions: () => ({ createBot: { mutateAsync: vi.fn() } }),
}));
vi.mock("@yonder/feature-me", () => ({
	ConnectorSetup: () => <p>connector cards</p>,
	useSetupConnectors: () => ({ device: { id: "d" }, definitions: world.definitions, instances: [], loading: false }),
}));
vi.mock("../../lib/local-files.ts", () => ({ useLocalFilesAdapter: () => undefined }));
// The page's own frame is not under test here, and the real one reads the locale preference.
vi.mock("@yonder/feature-auth", async (original) => ({
	...(await original<typeof import("@yonder/feature-auth")>()),
	AuthLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

import { SetupPage } from "./setup-page.tsx";

function Where() {
	return <output data-testid="where">{useLocation().pathname}</output>;
}

function open(path: string) {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path="/setup/:step" element={<SetupPage />} />
					<Route path="*" element={<Where />} />
				</Routes>
				<Where />
			</MemoryRouter>
		</I18nextProvider>,
	);
}

const location = () => screen.getAllByTestId("where").at(-1)?.textContent;

beforeEach(() => {
	world.definitions = [{ id: "local-files", kind: "device", name: "x", description: "x", platforms: ["macos"] }];
	world.updateMe.mockReset().mockResolvedValue(undefined);
	world.updateBot.mockReset().mockResolvedValue(bot);
	world.completeOnboarding.mockReset().mockResolvedValue({ conversationId: "owner-chat" });
});

test("an unknown step starts at the first one", async () => {
	open("/setup/password");
	await waitFor(() => expect(location()).toBe("/setup/you"));
});

test("the name step goes on to the Bot step, whether it was saved or skipped", async () => {
	const user = userEvent.setup();
	open("/setup/you");
	expect(screen.getByRole("heading", { name: "What should the Bot call you?" })).toBeInTheDocument();
	await user.type(screen.getByLabelText("Name"), "Test user");
	await user.click(screen.getByRole("button", { name: "Continue" }));
	await waitFor(() => expect(location()).toBe("/setup/bot"));
	expect(world.updateMe).toHaveBeenCalledWith({ displayName: "Test user" });
});

test("the Bot step names the Bot the account already has, and skipping leaves it alone", async () => {
	const user = userEvent.setup();
	open("/setup/bot");
	expect(screen.getByRole("heading", { name: "Name your Bot" })).toBeInTheDocument();
	await user.click(screen.getByRole("button", { name: "Skip this step" }));
	await waitFor(() => expect(location()).toBe("/setup/connect"));
	expect(world.updateBot).not.toHaveBeenCalled();
});

test("the last step shows the connectors and opens the app", async () => {
	const user = userEvent.setup();
	open("/setup/connect");
	expect(screen.getByText("connector cards")).toBeInTheDocument();
	await user.click(screen.getByRole("button", { name: "Skip for now" }));
	await waitFor(() => expect(location()).toBe("/messages/owner-chat"));
	expect(world.completeOnboarding).toHaveBeenCalledTimes(1);
	expect(world.completeOnboarding).toHaveBeenCalledWith(["connect"]);
});

test("where nothing can be connected the flow ends after the Bot and never shows the connect step", async () => {
	world.definitions = [];
	const user = userEvent.setup();
	const view = open("/setup/bot");
	expect(view.container.querySelectorAll("ol li")).toHaveLength(2);
	await user.click(screen.getByRole("button", { name: "Skip this step" }));
	await waitFor(() => expect(location()).toBe("/messages/owner-chat"));
	view.unmount();
	open("/setup/connect");
	await waitFor(() => expect(location()).toBe("/setup/bot"));
	expect(screen.queryByText("connector cards")).toBeNull();
});

test("keeps setup open after a failed completion and opens the conversation after retry", async () => {
	world.completeOnboarding.mockRejectedValueOnce(new Error("offline"));
	const user = userEvent.setup();
	open("/setup/connect");
	await user.click(screen.getByRole("button", { name: "Skip for now" }));
	expect(await screen.findByRole("alert")).toHaveTextContent("Could not finish setup");
	expect(location()).toBe("/setup/connect");
	await user.click(screen.getByRole("button", { name: "Try again" }));
	await waitFor(() => expect(location()).toBe("/messages/owner-chat"));
	expect(world.completeOnboarding).toHaveBeenCalledTimes(2);
});
