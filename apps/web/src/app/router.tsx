/**
 * The route table from 11 第四节, wired to React Router. The guard runs here, once: an unauthenticated
 * visit to a protected path is remembered and returned to after signing in (05 第四节第 1 条).
 */

import { useSessionStore } from "@yonder/ui-data";
import { lazy, Suspense } from "react";
import type { Location } from "react-router";
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes, useLocation } from "react-router";
import { Splash } from "../pages/splash.tsx";
import { ChunkBoundary } from "./chunk-boundary.tsx";
import { MemberCardRoute } from "./member-card-route.tsx";

const ContactWindowPage = lazy(() =>
	import("../pages/chat-actions/contact-window-page.tsx").then((module) => ({ default: module.ContactWindowPage })),
);
const DownloadPage = lazy(() =>
	import("../pages/download-page.tsx").then((module) => ({ default: module.DownloadPage })),
);
const InvitePage = lazy(() => import("../pages/invite-page.tsx").then((module) => ({ default: module.InvitePage })));
const LandingPage = lazy(() => import("../pages/landing-page.tsx").then((module) => ({ default: module.LandingPage })));
const LegalPage = lazy(() => import("../pages/legal-page.tsx").then((module) => ({ default: module.LegalPage })));
const PricingPage = lazy(() => import("../pages/pricing-page.tsx").then((module) => ({ default: module.PricingPage })));
const SetupPage = lazy(() => import("../pages/setup/setup-page.tsx").then((module) => ({ default: module.SetupPage })));
const SignInPage = lazy(() => import("../pages/sign-in-page.tsx").then((module) => ({ default: module.SignInPage })));
const AppFrame = lazy(() => import("./app-frame.tsx").then((module) => ({ default: module.AppFrame })));

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
				<ChunkBoundary resetKey={(background ?? location).pathname}>
					{/* `/@对外号` is not a route React Router can express; this guard answers it first (17 3.7). */}
					<MemberCardRoute pathname={(background ?? location).pathname}>
						<Suspense fallback={<Splash />}>
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
								<Route path="/pricing" element={<PricingPage />} />
								<Route path="/i/:code" element={<InvitePage />} />
								<Route
									path="/setup/:step"
									element={
										<RequireSession>
											<SetupPage />
										</RequireSession>
									}
								/>
								<Route
									path="/*"
									element={
										<RequireSession>
											<Routes>
												<Route path="/contacts/add" element={<ContactWindowPage />} />
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
						</Suspense>
					</MemberCardRoute>
				</ChunkBoundary>
			</div>
			{background && (
				<ChunkBoundary resetKey={location.pathname}>
					<Suspense fallback={<Splash />}>
						<Routes>
							<Route path="/terms" element={<LegalPage kind="terms" />} />
							<Route path="/privacy" element={<LegalPage kind="privacy" />} />
						</Routes>
					</Suspense>
				</ChunkBoundary>
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
