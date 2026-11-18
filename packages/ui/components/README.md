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
| `EmptyState`                                      | page or inline; icon, one honest sentence, optional actions                    |
| `ListGroup` / `ListRow`                           | button, static, value and control (switch) rows; inset hairline                |
| `Switch`, `Badge`, `Banner`, `InlineError`        | immediate toggle; small status mark; page notice; inline failure with retry    |
| `Spinner`, `LoadingRow`, `Menu`, `MenuSurface`    | the one spinner; a loading line; action menu and the shared floating surface   |

Which component for which pattern: `docs/design-system.md`.

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
