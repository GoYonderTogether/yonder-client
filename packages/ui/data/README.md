# @yonder/ui-data

Layer 4: server state, its cache, the realtime channel, and the platform seams a feature needs.

A feature calls these hooks. It never calls `fetch`, never builds a cache key string, and never
copies server data into a store.

## What it holds

| area           | what                                                                                   |
| -------------- | -------------------------------------------------------------------------------------- |
| `query/`       | the `QueryClient`, its persistence, and the one key table                              |
| `hooks/`       | `useMe`, `useHealth`, `useUpdateMe`, `useUploadAvatar`, `useSessions`, `useSignOut`, … |
| `realtime/`    | the socket, backoff, and the table of what an event does to the cache                  |
| `auth/`        | the in-memory token store and the session status store                                 |
| `preferences/` | theme and language, stored locally                                                     |
| `storage/`     | one `Storage` interface over localStorage, with a memory fallback                      |

## The cache rules this implements (08)

1. `me` is restored from persistence before the network answers; the shell paints from it.
2. Retries happen for network failures only — never for a business error such as a wrong code.
3. A `member.updated` event replaces the cached member in place; no refetch.
4. Signing out clears the query cache and the persisted copy. Theme and language are device
   preferences, not account data, and stay.
5. A revoked session closes the socket and sends the app back to sign-in; it does not retry.
6. Conversations and messages use the keys from `08-前端缓存和同步.md` 第三节. Message events update
   one cached message and reconcile optimistic sends by client nonce; quota events replace the balance.
7. Provider save and model discovery pass keys directly to the API without caching mutation variables
   (架构-07 供应第 5 条).

## Rules

- Tokens are never written to `localStorage`. The access token is a variable in memory; the refresh
  token is an httpOnly cookie on the web and the OS keychain in a shell.
- No component state mirrors a query result.
- `useTheme` writes `data-theme` on `<html>`; that is the entire theme mechanism.
- `ApiError` and `NetworkError` are re-exported here so a feature can branch on a failure without
  depending on the HTTP client package.
