import { ME_SECTION_IDS } from "@yonder/feature-me";
import { MAIN_CONVERSATION, ROUTES } from "@yonder/ui-shell";
import { Link } from "react-router";

const paths = ROUTES.flatMap(({ path }) => {
	if (path === "/messages/:conversationId") return [path.replace(":conversationId", MAIN_CONVERSATION)];
	if (path === "/tasks/:taskId" || path === "/memory/files/:path" || path === "/memory/g/:group") return [];
	if (path === "/me/:section") return ME_SECTION_IDS.map((section) => path.replace(":section", section));
	if (path === "/me/:section/:page") return [path.replace(":section", "account").replace(":page", "password")];
	return [path];
}).concat(["/dev/components", "/not-found"]);

export function Navigation({ onNavigate }: { onNavigate: () => void }) {
	return (
		<details>
			<summary>Go to</summary>
			<nav aria-label="Developer routes" className="dev-panel-routes">
				{paths.map((path) => (
					<Link key={path} to={path} onClick={onNavigate}>
						{path}
					</Link>
				))}
			</nav>
		</details>
	);
}
