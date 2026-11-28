# Web deploy

The production Web site is `https://yonderbot.net`. Stable is served at the root and beta at
`/beta/`. Both use the same API origin and shared content-hashed assets. Account eligibility
and the user's selection are checked by the app before opening the beta experience.

## How a release reaches the site

1. `release.yml` dispatches `web-deploy.yml` for the published prerelease tag.
2. `web-deploy.yml` resolves the tag to its commit, checks out that commit, confirms the
   Web package version, builds it, and adds `version.json` and `build-version.json`.
3. The workflow connects with the restricted `DEPLOY_SSH_KEY` and pinned host key. The
   server's forced command is `/opt/yonder-card/bin/yonder-web-deploy`.
4. `beta-status` reads the beta pointer. When it differs from the candidate, the job sends
   `beta <version>-<sha12> <tar sha256>` followed by the tar. The executor verifies the
   bundle and switches `web/beta-current`.
5. `promote-stable.yml` checks the accepted candidate is retained, then switches
   `web/current` to that same directory. Both commands verify the version and commit through
   local nginx. An unsuccessful probe restores the prior live target.

The executor retains the newest five snapshots plus the current and previous snapshot of each
channel. Candidate uploads and stable promotion leave the backend deployment as a separate step.

## Rollback

Revoke beta access to return an affected user to stable. For a public Web regression, an
operator can restore the retained stable `web/previous` pointer and check
`/build-version.json`, or promote a newer fixed candidate. The regular beta workflow only
advances the beta pointer.

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
Every later publish adds its assets before switching a channel pointer; same-name different-content assets
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
