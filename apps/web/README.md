# @yonder/web

The page the shell shows: Vite + React 19 + Tailwind 4. The pages are `src/pages/`, the route table
is `src/app/router.tsx`, and the providers and shell wiring are `src/app/`.

## Run it

```sh
npm run dev -w @yonder/web     # http://127.0.0.1:5173, needs apps/cloud on :8090
npm run build -w @yonder/web   # writes apps/web/dist
npm run preview -w @yonder/web
```

`apps/desktop` bundles `apps/web/dist` as its frontend assets, so build the web app before building
the desktop app.

## Development panel

In the Vite development server, open the floating bug button or press `Ctrl+Shift+D` / `⌘⇧D`.
The panel navigates routes, changes the stored appearance and app width, and inspects or controls
the real session, realtime connection, query cache, and build information. Session and cache actions
affect the current development account and data. `/dev/components` links to the panel and back.
`Expire access token` removes the in-memory access token while preserving the refresh credential;
the next protected request receives a 401 and follows the normal refresh path.
The panel is excluded from production builds; `npm run check` verifies this with a production build.

## Build configuration

- **Version**: injected at compile time from this package's `package.json` (`__YONDER_VERSION__` in
  `vite.config.ts`), read by `src/lib/config.ts`.
- **API origin**: `apiBaseUrl()`. On the web the API is the same origin, so the path is relative; in
  the desktop shell the page is loaded from `tauri://localhost`, which cannot resolve a relative
  `/v1`, so the shell uses `VITE_API_BASE` or the production origin.
- **Dev proxy**: `/v1` (including the WebSocket), `/files` and `/api` are forwarded to
  `http://127.0.0.1:8090`.
- **Tailwind sources**: `src/index.css` names the component packages with `@source`. Tailwind's
  automatic scan skips workspace packages reached through `node_modules` symlinks, so without those
  lines every class used only inside `packages/ui/*` is missing from the bundle.
- **First paint**: `index.html` has a short inline script that sets `data-theme`, `lang` and
  `data-density` from storage before any CSS loads, so the page never flashes the wrong theme.

## Layout

Chat text uses [markdown-to-jsx](https://github.com/quantizor/markdown-to-jsx), a small maintained
React renderer that handles CommonMark without an HTML injection API. Raw HTML parsing is disabled,
the library's URL sanitizer remains enabled, and images are suppressed to avoid unrequested remote
loads. `src/pages/message-content.test.tsx` checks those boundaries. The provider preset model names
are suggestions from [DeepSeek's public model-list example](https://api-docs.deepseek.com/api/list-models/),
not the platform default; users can edit them.

```
index.html                       shell document, first-paint script
vite.config.ts                   build config, version injection, dev proxy
src/main.tsx                     mounts <App/>
src/app/app.tsx                  providers (data, i18n) and the router
src/app/router.tsx               the route table and the sign-in guard
src/app/app-frame.tsx            the signed-in frame
src/pages/                       one file per page
src/lib/config.ts                build version and API origin
src/lib/keychain.ts              the shell's refresh token in the OS keychain
src/index.css                    Tailwind entry and the global rules
```

## Rules

- Import packages through their entry only; never `@yonder/ui-data/src/...`.
- An app may depend on packages; packages may never depend on an app.
- 300 lines warns, 500 fails (`tools/check-file-length.mjs`).
