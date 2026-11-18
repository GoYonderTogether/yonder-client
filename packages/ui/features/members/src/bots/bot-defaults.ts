// Short, neutral pet names selected from sindresorhus/cat-names (MIT).
// Source and license: docs/third-party/cat-names.md in this repository.
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

/** The six palette ids the server accepts (01 ≤ 6). A Bot without a picture shows this colour. */
export const BOT_AVATAR_COLORS = ["1", "2", "3", "4", "5", "6"] as const;

/** Same limit as a person's name; counted in characters, not UTF-16 units. */
export const BOT_NAME_MAX = 40;

/** What the avatar upload accepts, the same as `/v1/me/avatar`. */
export const BOT_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const BOT_AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export function randomBotName(_locale: string): string {
	return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] ?? BOT_NAMES[0];
}
