# Web deploy

The web app is served at `https://yonder.zethai.cn` — the primary name, because `yonderbot.net` has no
ICP filing (备案) in mainland China. `https://yonderbot.net` answers with a 301 to it. Both names point
at the same server (`47.98.126.143`); the page, `/api/` and the WebSocket routes live on the zethai
name only.

## How a release reaches the site

1. `release.yml` publishes the GitHub Release, then dispatches `web-deploy.yml` in this repository with
   `tag=v<version>`. If that dispatch fails, the release stays published and a warning tells you to
   run it by hand: `gh workflow run web-deploy.yml -f tag=v<version>`.
2. `web-deploy.yml` resolves the tag to its commit, checks out that commit, confirms
   `apps/web/package.json` has the tag's version, runs `npm ci && npm run build`, writes
   `version.json` and `build-version.json` into `apps/web/dist`, and tars `apps/web/dist`.
3. It connects to the server with the `DEPLOY_SSH_KEY` secret. The host key is pinned in the workflow.
   On the server that key is bound by `command=` in `authorized_keys` to
   `/opt/yonder-card/bin/yonder-web-deploy`; it can do nothing else.
4. The executor answers `status` with `current=<version>-<sha12>`; the workflow skips the upload when
   the site already runs that build. Otherwise it streams `<version>-<sha12> <tar sha256>` plus the tar.
   The executor checks the hash, requires `index.html`, `version.json` and `yonder-sw.js` in the bundle,
   unpacks into `web/releases/<version>-<sha12>`, switches `web/current` atomically, keeps the
   previous release as `web/previous`, and prunes all but the newest five.
5. Finally the executor fetches `https://yonder.zethai.cn/build-version.json` through nginx on the server
   itself and fails the run unless it reports the new version. GitHub's runners are outside China and
   their TLS to the public site is reset, so this local check is the authoritative one.

The executor never restarts a service and never touches nginx or the backend. `/api/` on the site
still goes to the old backend on port 18051, so the page shows the server's version next to its own
and marks the difference. Replacing the backend is a separate step.

## Rollback

Run `web-deploy.yml` with the earlier tag. The executor keeps the last five releases, so a redeploy
of a recent one is a pointer switch. The bundle that was live before the rebuild is
`0.3.26111201-58dad81e91fd` from the old repository layout; it cannot be rebuilt by this workflow,
but its directory is still on the server while it is among the newest five or is `web/previous`.

## History

- Until 2026-11-13 the deploy ran from `GoYonderTogether/yonder-cloud` (`deploy-web.yml`, every five
  minutes). It built the old `apps/app` and checked out this repository with its own token, which
  stopped working when this repository became private. That workflow is disabled; the deploy moved
  here so it can read the repository without a cross-repository credential.
- On 2026-11-13 the executor's final check was briefly changed to `yonderbot.net` because
  `yonder.zethai.cn` then redirected there (the old check could not pass). Backups on the server:
  `yonder-web-deploy.bak-20261113` (original).
- On 2026-11-14 the roles were swapped back: `yonderbot.net` has no ICP filing, so serving the product
  there is not viable. `yonder.zethai.cn` is the site again (same server block, certificate
  `/etc/nginx/ssl/zethai.cn`), and `yonderbot.net` is a 301 to it on ports 80 and 443. Nginx backups:
  `/etc/nginx/conf.d/yonder.conf.bak-20261114`, `/etc/nginx/conf.d/yonderbot.net.conf.bak-20261114`.
  The executor checks `yonder.zethai.cn` again. The certificate there covers `yonder.zethai.cn` and
  `www.yonder.zethai.cn`.
- The old app registered a service worker at `/yonder-sw.js`. The new app ships a file at that path
  that deletes the old caches and unregisters itself, so returning visitors get the new app.

## Web cache and retained assets

As of 2026-11-15, `/etc/nginx/conf.d/yonder.conf` includes
`/etc/nginx/yonder-web-cache.inc`, maintained as `deploy/nginx-yonder-web.conf`. The executor is
maintained as `deploy/yonder-web-deploy`. HTML, `version.json`, `build-version.json` and
`yonder-sw.js` use `no-cache` with nginx ETag/304; hashed assets use a one-year immutable cache.
Missing assets return 404. Existing root, TLS, gzip, API and attachment routes remain in the site.

All assets from the five releases present at rollout were seeded to `/opt/yonder-card/web/shared/assets`.
Every later publish adds its assets before switching `current`; same-name different-content assets
stop the publish. Retention is independent of the five release directories, which still govern rollback.
The shared directory is not automatically pruned: storage grows with new unique assets. At rollout it
contained 12 files totaling 3,481,574 bytes; the filesystem had about 3.2 GiB free. Monitor growth and
plan a separately authorized retention policy before disk pressure makes it necessary to delete assets.

Changes to either source require an explicit server deployment; the normal web release does not update
nginx or the executor. Check the live server block and inherited headers before integrating changes;
`add_header` in the assets location overrides server-level `add_header` inheritance. Run
`python3 deploy/test-nginx-yonder-web.py` with nginx on PATH, then `nginx -t` against the actual server
configuration before reload. Verify 200/304 and cache headers, missing assets, API health and old asset
bytes and MIME types after a release. For this rollout, the original files were backed up on the server
as `/etc/nginx/conf.d/yonder.conf.bak-cache-20261115` and
`/opt/yonder-card/bin/yonder-web-deploy.bak-cache-20261115`. To roll back, restore both files, run
`nginx -t` and reload; the shared assets can remain on disk. Rolling back removes old-chunk protection.
