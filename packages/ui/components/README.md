# @yonder/ui-components

Layer 2: the primitives. They take props and nothing else — no data hooks, no global state, no
device checks.

## What it holds

| component                                         | variants and states                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Button`                                          | primary / secondary / ghost / danger / link; sm / md / lg; loading             |
| `Field`, `TextInput`, `TextArea`                  | label above the field, a hint or an error line wired by `aria-describedby`     |
| `Card` + `CardHeader` / `CardBody` / `CardFooter` | the product's basic surface                                                    |
| `Avatar`                                          | person or Bot, sizes 16–64, a stable tint from the name when there is no image |
| `EmptyState`                                      | icon, one honest sentence, optional actions                                    |

## Rules

- **No colour literals.** Every value is a `var(--color-…)` from `@yonder/ui-tokens`, so a theme
  change touches no component.
- **Every icon-only control has an `aria-label`.**
- **A loading button keeps its label**, so the layout does not jump.
- **One `primary` per region**; `danger` needs a confirmation nearby.
- A component never reads the query cache. Data arrives as props.
- `SearchInput` shares the input surface and a left magnifier. Pages provide a short localized
  placeholder and own the query, submission and results; the placeholder is the accessible name
  unless the caller provides one.
