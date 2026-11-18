import { Text, View } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
import type { Member } from "@yonder/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorText, go, Page, State } from "../../components/ui";
import { listOwnedBots } from "../../lib/bots";
import { t } from "../../lib/i18n";
import { upsertOwnedBot, withoutMember } from "../../lib/member-cache";
import { client, subscribeEvents, useSession } from "../../lib/runtime";
import { ChatAvatar } from "../chat/avatar";

const avatarSrc = (url: string | null | undefined) =>
	url ? (url.startsWith("/") ? `${client.baseUrl}${url}` : url) : undefined;

/**
 * 「我 › Bot」: every Bot this account owns, the default one first. A row opens the same Bot page
 * the chat title opens; the default Bot looks the same there except that it has no delete button.
 * A rename or a deletion on another device patches the list over the realtime channel, and coming
 * back to the page refetches, because a Bot created elsewhere is announced by no event this page
 * listens to.
 */
export default function BotList() {
	const { status, me } = useSession();
	const meId = me?.member.id ?? "";
	const [bots, setBots] = useState<Member[]>();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const load = useCallback(async () => {
		if (!meId) return;
		setError("");
		try {
			setBots(await listOwnedBots(meId));
		} catch (cause) {
			setError(errorText(cause));
		} finally {
			setLoading(false);
		}
	}, [meId]);
	useEffect(() => {
		if (status === "signed-in") void load();
		else {
			setBots(undefined);
			setLoading(status === "booting");
			setError("");
		}
	}, [status, load]);
	useEffect(
		() =>
			subscribeEvents((event) => {
				if (event.type === "member.updated")
					setBots((current) => (current ? upsertOwnedBot(current, event.member, meId) : current));
				if (event.type === "member.removed")
					setBots((current) => (current ? withoutMember(current, event.memberId) : current));
			}),
		[meId],
	);
	const shown = useRef(false);
	useDidShow(() => {
		if (shown.current && status === "signed-in") void load();
		shown.current = true;
	});
	return (
		<Page title={t("Bot", "Bots")}>
			<State
				loading={loading}
				error={error}
				retry={() => void load()}
				empty={!loading && !error && !bots?.length ? t("还没有 Bot", "No bots yet") : undefined}
			/>
			<View className="mini-card">
				{bots?.map((bot) => (
					<View
						key={bot.id}
						className="mini-row"
						onClick={() => go(`/pages/bot/index?id=${encodeURIComponent(bot.id)}`)}
					>
						<ChatAvatar
							name={bot.displayName}
							kind="bot"
							src={avatarSrc(bot.avatarUrl)}
							color={bot.avatarColor}
							size={40}
						/>
						<View className="mini-row-main">
							<Text>{bot.displayName}</Text>
							<Text className="mini-muted">{bot.isDefault ? t("默认", "Default") : `@${bot.handle}`}</Text>
						</View>
						<Text className="mini-muted">›</Text>
					</View>
				))}
			</View>
		</Page>
	);
}
