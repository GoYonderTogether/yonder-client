# @yonder/ui-tokens

Layer 1: the design variables. CSS custom properties and the plain TypeScript constants that name
them. **No components.**

## What it holds

- `src/glow.css` — the glow style; the app imports it right after `tokens.css` so it overrides the themes.
- `src/tokens.css` — imported once by the app. `@theme` gives Tailwind the type scale, spacing,
  radii and fonts; `:root` / `[data-theme]` give the semantic colours, shadows, motion values and
  the avatar fallback tints.
- `src/scale.ts` — icon sizes and strokes, content widths and springs as numbers for JS props; its
  test fails when they drift from `tokens.css`.
- `src/theme.ts` — `ThemeChoice` (`system` | `light` | `dark`), `resolveTheme`, and the two storage
  keys the first-paint script in `index.html` also reads.

## Rules

- A component never contains `#`, `rgb(` or `hsl(`. It writes `var(--color-text-primary)`.
- Switching light/dark changes `data-theme` on `<html>` and nothing else.
- The type scale has eight steps. Adding a ninth needs a reason.
- `prefers-reduced-motion` sets every duration to `0ms` here, so no component needs to know.
- Contrast targets: body 7:1, secondary text 4.5:1, disabled 3:1 (02-视觉样式 第二节).
- What each token is for: `docs/design-system.md`.
