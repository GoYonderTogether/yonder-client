import { lazy, type ReactNode, Suspense } from "react";
import { memberHandle } from "../pages/member-card-path.ts";
import { Splash } from "../pages/splash.tsx";

import { warmableImport } from "./warmable-import.ts";

const memberCardPage = warmableImport(() => import("../pages/member-page.tsx"));
const MemberCardPage = lazy(() => memberCardPage().then((module) => ({ default: module.MemberCardPage })));

export function preloadMemberCard(pathname: string) {
	if (memberHandle(pathname)) void memberCardPage().catch(() => undefined);
}

/**
 * `/@对外号` is outside every route the router can express (see `member-card-path.ts`), so it is
 * decided here, before the app's own catch-all renders: a card path becomes the card, and every
 * other path is handed back untouched. The card answers for signed-out readers itself, so this sits
 * above the session guard rather than inside it.
 */
export function MemberCardRoute({ pathname, children }: { pathname: string; children: ReactNode }) {
	const handle = memberHandle(pathname);
	if (!handle) return <>{children}</>;
	return (
		<Suspense fallback={<Splash />}>
			<MemberCardPage handle={handle} />
		</Suspense>
	);
}
