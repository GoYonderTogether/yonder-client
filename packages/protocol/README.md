# @yonder/protocol

The shared vocabulary between the server and every client. Format definitions only: types and the
runtime constants that go with them (error codes, the realtime path).

## What it holds

| area        | what                                                                              |
| ----------- | --------------------------------------------------------------------------------- |
| `common/`   | `ErrorCode`, `ApiErrorBody`, `Timestamp` — the shape of every failure             |
| `member/`   | `Member` (person or Bot), `MeResponse`, profile updates, upload handshake         |
| `auth/`     | code sending, code sign-in, password sign-in, password setting, refresh, deletion |
| `realtime/` | the WebSocket client/server event types and close codes                           |
| `version/`  | `VersionPayload` for `GET /api/version`                                           |

## Rules

- **Depends on nothing.** No runtime dependency, no import from any other workspace package.
  `tools/check-dependency-direction.mjs` enforces this.
- **Export only through `src/index.ts`.** Other packages import `@yonder/protocol`, never
  `@yonder/protocol/src/auth/auth.ts`.
- **No build step.** `exports` points straight at `src/index.ts`; Node strips the types, Vite
  compiles them for the browser, `tsc -b` typechecks.
- **No logic.** If a type needs behaviour, the behaviour belongs in the package that owns it.

## Adding something

One file per concept under `src/<area>/`, a `.test.ts` beside it when there is something to assert,
and an `export` line in `src/index.ts`. Version the protocol additively: add, never rename.
