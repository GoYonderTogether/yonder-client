## Summary

<!-- What changes and why. -->

## Checklist

- [ ] `npm run check` passes (lint, typecheck, tests, the `tools/` checks)
- [ ] `npm run build` passes
- [ ] Packages are imported through their entry only (`@yonder/protocol`, never `@yonder/protocol/src/...`)
- [ ] `packages/protocol` still depends on nothing
- [ ] No file crosses 500 lines
- [ ] If a workflow or release script changed, the change is described in `docs/release.md`
