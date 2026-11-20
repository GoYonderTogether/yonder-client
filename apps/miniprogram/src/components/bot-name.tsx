import { Text, View } from "@tarojs/components";
import type { ConversationMember, Member } from "@yonder/protocol";
import { t } from "../lib/i18n";

export function MiniBotName({
	name,
	ownedBot,
	owner,
	compact,
}: {
	name: string;
	ownedBot?: Member;
	owner?: ConversationMember["botOwner"];
	compact?: "list" | "header";
}) {
	const showOwner = owner !== undefined;
	const main = !showOwner && ownedBot?.isDefault;
	const mainLabel = t("主 Bot", "Main Bot");
	const role = showOwner ? undefined : ownedBot?.botRoleLabel;
	const label = main ? mainLabel : "AI";
	const ownerText = owner ? `@${owner.displayName || owner.handle}` : t("他人的 Bot", "Someone else's Bot");
	const content = (
		<>
			<Text
				className={`mini-bot-display-name${compact && role ? " mini-bot-display-name-with-duty" : ""}`}
				ariaLabel={name}
			>
				{name}
			</Text>{" "}
			{showOwner ? (
				<>
					<Text
						className="mini-bot-owner"
						ariaLabel={
							owner?.displayName && owner.displayName !== owner.handle ? `${ownerText} (@${owner.handle})` : ownerText
						}
					>
						{ownerText}
					</Text>{" "}
				</>
			) : null}
			<Text className={main ? "mini-bot-label mini-bot-label-main" : "mini-bot-label"} ariaLabel={label}>
				{label}
			</Text>
			{role ? (
				<Text className="mini-bot-duty" ariaLabel={role}>
					{role}
				</Text>
			) : null}
		</>
	);
	return compact ? (
		<View className={`mini-bot-name mini-bot-name-compact mini-bot-name-${compact}`}>{content}</View>
	) : (
		<Text className="mini-bot-name">{content}</Text>
	);
}
