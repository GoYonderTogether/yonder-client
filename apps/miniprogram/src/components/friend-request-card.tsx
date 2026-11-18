import { Text, View } from "@tarojs/components";
import { useState } from "react";
import { t } from "../lib/i18n";
import { action, Button, State } from "./ui";
import { useFriendRequests } from "./use-friend-requests";

export function FriendRequestCard({ id }: { id: string }) {
	const requests = useFriendRequests(id);
	const request = requests.items.find((item) => item.id === id);
	const [busy, setBusy] = useState(false);
	const incoming = request?.recipient.id === requests.owner;
	const peer = incoming ? request?.sender : request?.recipient;
	return (
		<View className="mini-card">
			<State loading={!request && requests.loading} error={requests.error} retry={() => void requests.reload()} />
			{request && peer ? (
				<>
					<Text>{peer.displayName}</Text>
					<Text className="mini-muted">{t("好友申请", "Friend request")}</Text>
					{request.status === "accepted" ? (
						<Text>{t("已同意", "Accepted")}</Text>
					) : incoming ? (
						<Button
							loading={busy}
							disabled={busy}
							onClick={() =>
								void action(async () => {
									setBusy(true);
									try {
										await requests.accept(id);
									} finally {
										setBusy(false);
									}
								})
							}
						>
							{t("同意", "Accept")}
						</Button>
					) : (
						<Text>{t("已发送申请", "Request sent")}</Text>
					)}
				</>
			) : null}
		</View>
	);
}
