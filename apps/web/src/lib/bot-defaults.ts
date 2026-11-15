// Short, neutral pet names selected from sindresorhus/cat-names (MIT).
// Source and license: docs/third-party/cat-names.md.
export const BOT_NAMES = [
	"Boots",
	"Dusty",
	"Gizmo",
	"Kiki",
	"Misty",
	"Muffin",
	"Patches",
	"Peanut",
	"Pepper",
	"Socks",
	"Willow",
] as const;
export const BOT_AVATAR_COLORS = ["1", "2", "3", "4", "5", "6"] as const;

export function randomBotName(_locale: string): string {
	return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] ?? BOT_NAMES[0];
}
