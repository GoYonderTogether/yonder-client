# tools/

Repository checks, each a standalone script with a test next to it. CI runs all of them; so does
`npm run check` locally.

| script                           | what it enforces                                                                                                                                                                                                          | exit           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `check-entry-imports.mjs`        | a workspace package (including nested ones such as `packages/ui/components`) may only be imported through its entry, never `@yonder/protocol/src/...` or a relative path into it                                          | 1 on violation |
| `check-dependency-direction.mjs` | the layer table in the script: apps ▸ features ▸ data ▸ shell ▸ components ▸ tokens, and apps ▸ gateway ▸ identity ▸ storage ▸ protocol; a feature may not import another feature; `packages/protocol` depends on nothing | 1 on violation |
| `check-file-length.mjs`          | warn at 300 lines, fail at 500 lines, for hand-written source under `packages/`, `apps/`, `tools/`, `scripts/`                                                                                                            | 1 at/over 500  |
| `check-tailwind-sources.mjs`     | every `packages/ui/**` package whose `src/` writes `className` is matched by an `@source` line (a directory, or a file glob) in `apps/web/src/index.css`, so Tailwind generates its classes                               | 1 on violation |

## Usage

```sh
node tools/check-entry-imports.mjs
node tools/check-dependency-direction.mjs
node tools/check-file-length.mjs            # --warn-at 300 --fail-at 500 by default
node tools/check-file-length.mjs --root /tmp/fixture
```

Each script also prints its result on success, so a green CI log says what ran.

## Adding a check

One script, one rule, one `.test.mjs` next to it. The test builds a throwaway tree in the OS temp
directory and asserts both the pass and the failure case — a check that cannot fail is not a check.
Wire it into `npm run check` and into `.github/workflows/ci.yml`.
