/**
 * The route table from 11 第四节, wired to React Router. The guard runs here, once: an unauthenticated
 * visit to a protected path is remembered and returned to after signing in (05 第四节第 1 条).
 */

import { useSessionStore } from "@yonder/ui-data";
import { lazy, Suspense } from "react";
import type { Location } from "react-router";
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes, useLocation } from "react-router";
import { DownloadPage } from "../pages/download-page.tsx";
import { InvitePage } from "../pages/invite-page.tsx";
import { LandingPage } from "../pages/landing-page.tsx";
import { LegalPage } from "../pages/legal-page.tsx";
import { SetupPasswordPage } from "../pages/setup-password-page.tsx";
import { SetupProfilePage } from "../pages/setup-profile-page.tsx";
import { SignInPage } from "../pages/sign-in-page.tsx";
import { Splash } from "../pages/splash.tsx";
import { AppFrame } from "./app-frame.tsx";

const ComponentsPage = import.meta.env.DEV ? lazy(() => import("../dev/components-page.tsx")) : null;
const DeveloperPanel = import.meta.env.DEV ? lazy(() => import("../dev/panel/index.tsx")) : null;

const router = createBrowserRouter([{ path: "*", element: <AppRoutes /> }]);

export function AppRouter() {
	return <RouterProvider router={router} />;
}

export function AppRoutes() {
	const location = useLocation();
	const background = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
	return (
		<>
			<div hidden={Boolean(background)}>
				<Routes location={background ?? location}>
					{ComponentsPage && (
						<Route
							path="/dev/components"
							element={
								<Suspense fallback={null}>
									<ComponentsPage />
								</Suspense>
							}
						/>
					)}
					<Route path="/" element={<LandingPage />} />
					<Route path="/download" element={<DownloadPage />} />
					<Route path="/sign-in" element={<SignInPage />} />
					<Route path="/terms" element={<LegalPage kind="terms" />} />
					<Route path="/privacy" element={<LegalPage kind="privacy" />} />
					<Route path="/i/:code" element={<InvitePage />} />
					<Route
						path="/setup/password"
						element={
							<RequireSession>
								<SetupPasswordPage />
							</RequireSession>
						}
					/>
					<Route
						path="/setup/profile"
						element={
							<RequireSession>
								<SetupProfilePage />
							</RequireSession>
						}
					/>
					<Route
						path="/*"
						element={
							<RequireSession>
								<Routes>
									<Route path="/today/*" element={<Navigate to="/messages" replace />} />
									<Route path="/me/memory/*" element={<Navigate to="/memory" replace />} />
									{/* The old chat path, from links written before the frame changed. */}
									<Route path="/chat/*" element={<Navigate to="/messages/main" replace />} />
									{/* The frame reads the URL itself: tab, then what is open inside it. */}
									<Route path="*" element={<AppFrame />} />
								</Routes>
							</RequireSession>
						}
					/>
				</Routes>
			</div>
			{background && (
				<Routes>
					<Route path="/terms" element={<LegalPage kind="terms" />} />
					<Route path="/privacy" element={<LegalPage kind="privacy" />} />
				</Routes>
			)}
			{DeveloperPanel && (
				<Suspense fallback={null}>
					<DeveloperPanel />
				</Suspense>
			)}
		</>
	);
}

/**
 * While the first refresh is in flight, show a neutral splash rather than the sign-in screen: a
 * returning user must not see a flash of "please sign in" on every reload.
 */
function RequireSession({ children }: { children: React.ReactNode }) {
	const status = useSessionStore((state) => state.status);
	const booting = useSessionStore((state) => state.booting);
	const location = useLocation();

	if (booting || status === "unknown") return <Splash />;
	if (status === "signed-out") {
		// A stale `?me=1` from the old overlay is not a destination; the page underneath is.
		const search = new URLSearchParams(location.search);
		search.delete("me");
		const query = search.toString();
		const next = `${location.pathname}${query ? `?${query}` : ""}`;
		const target = next === "/messages" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`;
		return <Navigate to={target} replace />;
	}
	return <>{children}</>;
}
