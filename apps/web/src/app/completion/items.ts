import type { ConversationMember, Member, SkillSummary } from "@yonder/protocol";
import type { CompletionItem } from "./tokens.ts";

export function completionItems(
	skills: readonly SkillSummary[],
	contacts: readonly Member[],
	members: readonly ConversationMember[],
	bot: Member | undefined,
	compactLabel: string,
): CompletionItem[] {
	const people = new Map<string, CompletionItem>();
	for (const member of [...contacts, ...(bot ? [bot] : [])]) {
		people.set(member.id, {
			id: member.id,
			kind: "member",
			name: member.displayName,
			description: `@${member.handle}`,
			memberKind: member.kind,
			avatarUrl: member.avatarUrl,
		});
	}
	for (const member of members) {
		people.set(member.memberId, {
			id: member.memberId,
			kind: "member",
			name: member.displayName,
			description: `@${member.handle}`,
			memberKind: member.kind,
			avatarUrl: member.avatarUrl,
		});
	}
	return [
		{ id: "command:compact", kind: "command", name: "compact", description: compactLabel },
		...skills
			.filter((skill) => skill.enabled)
			.map(
				(skill): CompletionItem => ({
					id: skill.id,
					kind: "skill",
					name: skill.name,
					displayNameZh: skill.displayNameZh,
					description: skill.description,
					source: skill.source,
				}),
			),
		...people.values(),
	];
}
