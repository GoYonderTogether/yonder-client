import { Text, View } from "@tarojs/components";
import type { QuotaLedgerPage, UsagePage } from "@yonder/protocol";
import { formatInstant } from "@yonder/ui-time";
import { useState } from "react";
import { action, Button, Page, Row, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { currentLocale, t } from "../../lib/i18n";
import { api, useSession } from "../../lib/runtime";
import { accountTimeZone } from "../../lib/time";

export default function Quota() {
	const { me } = useSession();
	const zone = accountTimeZone(me);
	const { data, loading, error, reload } = useResource(async () => ({
		quota: await api.quota(),
		ledger: await api.quotaLedger(),
		usage: await api.usage(),
	}));
	const [ledger, setLedger] = useState<QuotaLedgerPage>();
	const [usage, setUsage] = useState<UsagePage>();
	const entries = ledger || data?.ledger;
	const calls = usage || data?.usage;
	return (
		<Page title={t("额度与用量", "Quota & usage")}>
			<State
				loading={loading}
				error={error}
				retry={() => {
					setLedger(undefined);
					setUsage(undefined);
					void reload();
				}}
			/>
			{data && (
				<>
					<View className="mini-card">
						<Text className="mini-muted">{t("主额度剩余", "Main quota")}</Text>
						<Text className="mini-title">{data.quota.pools.main.remaining}</Text>
						<Row title={t("累计获得", "Granted")} detail={String(data.quota.pools.main.granted)} />
						<Row title={t("累计使用", "Used")} detail={String(data.quota.pools.main.used)} />
						<Row
							title={t("后台 / 执行 / 对外", "Background / execution / external")}
							detail={[
								data.quota.pools.background.remainingPercent,
								data.quota.pools.coding.remainingPercent,
								data.quota.pools.external.remainingPercent,
							]
								.map((value) => `${Math.round(value)}%`)
								.join(" / ")}
						/>
					</View>
					<View className="mini-card">
						<Text className="mini-subtitle">{t("额度记录", "Quota ledger")}</Text>
						{entries?.items.map((entry) => (
							<Row
								key={entry.id}
								title={`${entry.amount > 0 ? "+" : ""}${entry.amount}`}
								detail={`${formatInstant(entry.at, { zone, locale: currentLocale(), style: "dateTime", width: "short", year: "always" })} · ${entry.note || entry.kind}`}
							/>
						))}
						{entries?.hasMore && (
							<Button
								secondary
								onClick={() =>
									void action(async () => {
										const next = await api.quotaLedger(entries.nextCursor || undefined);
										setLedger({ ...next, items: [...entries.items, ...next.items] });
									})
								}
							>
								{t("加载更多", "Load more")}
							</Button>
						)}
					</View>
					<View className="mini-card">
						<Text className="mini-subtitle">{t("模型调用", "Model calls")}</Text>
						{calls?.items.map((call) => (
							<Row
								key={call.id}
								title={`${call.model} · ${call.pool}`}
								detail={`${formatInstant(call.at, { zone, locale: currentLocale(), style: "dateTime", width: "short", year: "always" })} · ${call.inputTokens ?? "—"} / ${call.outputTokens ?? "—"} · ${call.cost}`}
							/>
						))}
						{calls?.hasMore && (
							<Button
								secondary
								onClick={() =>
									void action(async () => {
										const next = await api.usage(calls.nextCursor || undefined);
										setUsage({ ...next, items: [...calls.items, ...next.items] });
									})
								}
							>
								{t("加载更多", "Load more")}
							</Button>
						)}
					</View>
				</>
			)}
		</Page>
	);
}
