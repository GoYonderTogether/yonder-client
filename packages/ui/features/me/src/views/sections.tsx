import { Boxes, Gauge, Gift, Info, Laptop, ShieldCheck, SlidersHorizontal } from "lucide-react";

/**
 * The 「我」 sections, grouped the way the list shows them (11 第六节). Adding a setting is one row
 * here and one case in `MeSectionPage`; the list, the routes and the back behaviour follow.
 */
export const ME_GROUPS = [
	{ id: "account", sections: [{ id: "account", icon: ShieldCheck }] },
	{
		id: "bot",
		sections: [
			{ id: "quota", icon: Gauge },
			{ id: "models", icon: Boxes },
			{ id: "devices", icon: Laptop },
		],
	},
	{ id: "invite", sections: [{ id: "invite", icon: Gift }] },
	{ id: "general", sections: [{ id: "general", icon: SlidersHorizontal }] },
	{ id: "other", sections: [{ id: "about", icon: Info }] },
] as const;

export type MeSectionId = "profile" | (typeof ME_GROUPS)[number]["sections"][number]["id"];

export const ME_SECTION_IDS: readonly MeSectionId[] = [
	"profile",
	...ME_GROUPS.flatMap((group) => group.sections.map((section) => section.id)),
];

export function isMeSection(value: string | undefined): value is MeSectionId {
	return value !== undefined && (ME_SECTION_IDS as readonly string[]).includes(value);
}
