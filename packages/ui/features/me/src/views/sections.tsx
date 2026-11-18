import {
	BookOpen,
	Bot,
	Boxes,
	EyeOff,
	Gauge,
	Gift,
	Info,
	Laptop,
	Plug,
	ShieldCheck,
	SlidersHorizontal,
} from "lucide-react";

/**
 * The 「我」 sections, grouped the way the list shows them (11 第六节). Adding a setting is one row
 * here and one case in `MeSectionPage`; the list, the routes and the back behaviour follow.
 */
export const ME_GROUPS = [
	{
		id: "account",
		// `privacy` is the three card switches (19 第四节); its wording belongs to `feature-members`.
		sections: [
			{ id: "account", icon: ShieldCheck },
			{ id: "privacy", icon: EyeOff, labelKey: "members.privacy.title" },
		],
	},
	{
		id: "bot",
		sections: [
			{ id: "bots", icon: Bot, labelKey: "bots.title" },
			{ id: "quota", icon: Gauge },
			{ id: "models", icon: Boxes },
			{ id: "skills", icon: BookOpen },
			{ id: "devices", icon: Laptop },
			{ id: "connectors", icon: Plug },
		],
	},
	{ id: "invite", sections: [{ id: "invite", icon: Gift }] },
	{ id: "general", sections: [{ id: "general", icon: SlidersHorizontal }] },
	{ id: "other", sections: [{ id: "about", icon: Info }] },
] as const;

export type MeSectionId = "profile" | (typeof ME_GROUPS)[number]["sections"][number]["id"];

/**
 * Where a section's row label comes from. Most sections live in the account table; one whose
 * wording belongs to its own feature (the Bot list) names its key here instead of the list
 * hard-coding an id.
 */
export function sectionLabelKey(section: { id: string; labelKey?: string }): string {
	return section.labelKey ?? `me.sections.${section.id}`;
}

export const ME_SECTION_IDS: readonly MeSectionId[] = [
	"profile",
	...ME_GROUPS.flatMap((group) => group.sections.map((section) => section.id)),
];

export function isMeSection(value: string | undefined): value is MeSectionId {
	return value !== undefined && (ME_SECTION_IDS as readonly string[]).includes(value);
}
