/**
 * The endpoints this slice uses, each a typed function over the shared `ApiClient`. Generated
 * from `@yonder/protocol` by hand because there is one client and one caller; when the surface
 * grows, this file is what a generator would produce.
 */
import { accountEndpoints } from "./account.ts";
import { agentCardEndpoints } from "./agent-cards.ts";
import { authEndpoints } from "./auth.ts";
import { channelEndpoints } from "./channels.ts";
import type { ApiClient } from "./client.ts";
import { commerceEndpoints } from "./commerce.ts";
import { connectorEndpoints } from "./connectors.ts";
import { conversationEndpoints } from "./conversations.ts";
import { itemEndpoints } from "./items.ts";
import { meetingEndpoints } from "./meetings.ts";
import { memberEndpoints } from "./members.ts";
import { memoryEndpoints } from "./memory.ts";
import { providerEndpoints } from "./providers.ts";
import { quotaEndpoints } from "./quota.ts";
import { scheduleEndpoints } from "./schedules.ts";
import { skillEndpoints } from "./skills.ts";

export type { SessionSummary } from "./account.ts";

/** Every endpoint group over one client; the groups never share a key. */
export function createEndpoints(client: ApiClient) {
	return {
		...meetingEndpoints(client),
		...memoryEndpoints(client),
		...scheduleEndpoints(client),
		...itemEndpoints(client),
		...conversationEndpoints(client),
		...connectorEndpoints(client),
		...channelEndpoints(client),
		...skillEndpoints(client),
		...memberEndpoints(client),
		...providerEndpoints(client),
		...authEndpoints(client),
		...quotaEndpoints(client),
		...accountEndpoints(client),
		...commerceEndpoints(client),
		...agentCardEndpoints(client),
	};
}

export type Endpoints = ReturnType<typeof createEndpoints>;
