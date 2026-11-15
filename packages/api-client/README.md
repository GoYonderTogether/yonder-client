# @yonder/api-client

The typed client for the gateway. It knows how to talk to the server; it knows nothing about React.

## What it holds

- `src/client.ts` — `ApiClient.request`: headers, the bearer token, the cookie, the error shape
  (`ApiError`), a distinct `NetworkError`, and **one** refresh-and-retry on a 401. Concurrent 401s
  share a single refresh, because rotating the refresh token twice looks like reuse and would
  revoke the session.
- `src/endpoints.ts` — one function per endpoint this slice uses, typed from `@yonder/protocol`.

## Token storage

`TokenStore` is injected. On the web it holds the access token in memory and returns `null` for the
refresh token — that one lives in an httpOnly cookie the client cannot read. A shell keeps both in
the OS keychain and sends `X-Yonder-Client: shell` so the server returns the refresh token in the
body instead of a cookie.

## Rules

- Nothing here touches `localStorage` or `sessionStorage`.
- Every response body is typed from `@yonder/protocol`; nothing is re-declared locally.
- An unknown failure is never silently swallowed: it is a `NetworkError` or an `ApiError`.
