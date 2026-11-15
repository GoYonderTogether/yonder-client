# @yonder/ui-i18n

Layer 1.5: the text. Every layer above tokens may read it, so it sits beside tokens.

## What it holds

- `src/locales/en.ts` — the reference table. Its shape is the type the other language must satisfy,
  so a missing key is a **compile error**, not a blank label.
- `src/locales/zh-CN.ts` — typed as `Messages`, so it cannot drift.
- `src/i18n.ts` — the i18next instance and the locale decision: stored choice → system language →
  English.

## Rules

- Keys are English camelCase. Never use Chinese as a key.
- Code contains no user-facing string literal; everything goes through `t()`.
- A new key goes into `en.ts` first; the build then tells you Chinese is missing it.
- Dates and numbers go through `Intl`, not string concatenation.
