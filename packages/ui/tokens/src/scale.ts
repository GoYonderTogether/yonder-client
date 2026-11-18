/**
 * The numeric tokens that JavaScript needs as numbers: lucide's `size` and `strokeWidth` props and
 * Motion's spring options cannot read a CSS variable. Each value mirrors a variable in `tokens.css`;
 * `scale.test.ts` reads that file and fails when the two disagree.
 */

/** `--icon-sm/md/lg`: inline and row icons 16, controls and close buttons 20, back chevrons 24. */
export const ICON_SIZE = { sm: 16, md: 20, lg: 24 } as const;

/** `--icon-stroke` / `--icon-stroke-selected`: one weight, slightly heavier when selected. */
export const ICON_STROKE = { normal: 1.75, selected: 2.1 } as const;

export type IconSize = keyof typeof ICON_SIZE;

/** `--width-*`: the maximum width of a page column or a dialog. */
export const CONTENT_WIDTH = { form: 400, sheet: 560, reading: 680, wide: 880, max: 1024 } as const;

export type ContentWidth = keyof typeof CONTENT_WIDTH;

/**
 * `--spring-*`: unit-mass springs. `panel` drives GesturePanel; `pane` is the list-pane splitter,
 * whose step function is solved exactly (roots −20 and −60).
 */
export const SPRING = {
	panel: { stiffness: 500, damping: 46 },
	pane: { stiffness: 1200, damping: 80 },
} as const;
