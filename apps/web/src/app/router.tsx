/**
 * The route table from 11 第四节, wired to React Router. The guard runs here, once: an unauthenticated
 * visit to a protected path is remembered and returned to after signing in (05 第四节第 1 条).
 */

import { useSessionStore } from "@yonder/ui-data";
import { lazy, Suspense, useState } from "react";
import type { Location } from "react-router";
import {
	createBrowserRouter,
	matchPath,
	Navigate,
	Route,
	RouterProvider,
	Routes,
	useLocation,
	useSearchParams,
} from "react-router";
import { defaultMessagePath } from "../lib/default-message-path.ts";
import { Splash } from "../pages/splash.tsx";
import { ChunkBoundary } from "./chunk-boundary.tsx";
import { preloadFrameView } from "./lazy-tabs.ts";
import { MemberCardRoute, preloadMemberCard } from "./member-card-route.tsx";
import { NowProvider } from "./now-items.tsx";
import { TrayMainActions } from "./tray/main-actions.tsx";
import { warmableImport } from "./warmable-import.ts";

const ContactWindowPage = lazy(() =>
	import("../pages/chat-actions/contact-window-page.tsx").then((module) => ({ default: module.ContactWindowPage })),
);
const loadDownload = warmableImport(() => import("../pages/download-page.tsx"));
const loadInvite = warmableImport(() => import("../pages/invite-page.tsx"));
const loadLanding = warmableImport(() => import("../pages/landing-page.tsx"));
const loadLegal = warmableImport(() => import("../pages/legal-page.tsx"));
const loadPricing = warmableImport(() => import("../pages/pricing-page.tsx"));
const loadSignIn = warmableImport(() => import("../pages/sign-in-page.tsx"));
const DownloadPage = lazy(() => loadDownload().then((module) => ({ default: module.DownloadPage })));
const InvitePage = lazy(() => loadInvite().then((module) => ({ default: module.InvitePage })));
const LandingPage = lazy(() => loadLanding().then((module) => ({ default: module.LandingPage })));
const LegalPage = lazy(() => loadLegal().then((module) => ({ default: module.LegalPage })));
const PricingPage = lazy(() => loadPricing().then((module) => ({ default: module.PricingPage })));
const SignInPage = lazy(() => loadSignIn().then((module) => ({ default: module.SignInPage })));
const publicRoutes = [
	{ path: "/", load: loadLanding, element: <LandingPage /> },
	{ path: "/download", load: loadDownload, element: <DownloadPage /> },
	{ path: "/sign-in", load: loadSignIn, element: <SignInPage /> },
	{ path: "/terms", load: loadLegal, element: <LegalPage kind="terms" /> },
	{ path: "/privacy", load: loadLegal, element: <LegalPage kind="privacy" /> },
	{ path: "/pricing", load: loadPricing, element: <PricingPage /> },
	{ path: "/i/:code", load: loadInvite, element: <InvitePage /> },
];

export function preloadPublicEntry(pathname: string) {
	const route = publicRoutes.find(({ path }) => matchPath(path, pathname));
	if (route) void route.load().catch(() => undefined);
	else preloadMemberCard(pathname);
}

const SetupPage = lazy(() => import("../pages/setup/setup-page.tsx").then((module) => ({ default: module.SetupPage })));
const AppFrame = lazy(() => {
	// The session guard has admitted this URL. Load its visible pane alongside the frame.
	preloadFrameView(router.state.location.pathname);
	return import("./app-frame.tsx").then((module) => ({ default: module.AppFrame }));
});

const ComponentsPage = import.meta.env.DEV ? lazy(() => import("../dev/components-page.tsx")) : null;
const TimelinePreviewPage = import.meta.env.DEV ? lazy(() => import("../dev/timeline-preview.tsx")) : null;
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
			<TrayMainActions />
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
								{TimelinePreviewPage && (
									<Route
										path="/dev/timeline-preview"
										element={
											<Suspense fallback={null}>
												<TimelinePreviewPage />
											</Suspense>
										}
									/>
								)}
								{publicRoutes.map(({ path, element }) => (
									// Sign-in restores a session before it draws its form (main's session recovery).
									<Route key={path} path={path} element={path === "/sign-in" ? <SignInRoute /> : element} />
								))}
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
												{/* The unscoped former files entry opens the memory home; 了解 is a live page. */}
												<Route path="/memory/files" element={<Navigate to="/memory" replace />} />
												{/* The old chat path, from links written before the frame changed. */}
												<Route path="/chat/*" element={<Navigate to="/messages/main" replace />} />
												{/* The frame reads the URL itself: tab, then what is open inside it. */}
												<Route
													path="*"
													element={
														<NowProvider>
															<AppFrame />
														</NowProvider>
													}
												/>
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

function SignInRoute() {
	const booting = useSessionStore((state) => state.booting);
	return booting ? <Splash /> : <SignInAfterRestore />;
}

function SignInAfterRestore() {
	// Once the form is shown, its own login callback chooses the next page.
	const [restored] = useState(() => useSessionStore.getState().status === "signed-in");
	const [params] = useSearchParams();
	const next = params.get("next");
	if (!restored) return <SignInPage />;
	const destination =
		next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : defaultMessagePath();
	return <Navigate to={destination} replace />;
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
		const next = `${location.pathname}${query ? `?${query}` : ""}${location.hash}`;
		return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />;
	}
	return <>{children}</>;
}
