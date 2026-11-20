# Yonder internal preview

[Open the successful main-push CI runs](https://github.com/GoYonderTogether/yonder-client/actions/workflows/ci.yml?query=branch%3Amain+event%3Apush+is%3Asuccess).
Open the newest successful run that has the **Yonder-…-macos-ad-hoc-…** artifact. On that run:

- Download **Yonder-…-macos-ad-hoc-…** for the Mac disk image, SHA-256 checksum, exact commit,
  app version, processor architecture, and CI attempt. Check the commit and architecture in
  `build-info.txt` and verify the image from the extracted artifact folder with
  `shasum -a 256 -c SHA256SUMS`.
- Download **web-dist** for the Web bundle from the same commit. It is a bundle for testing,
  not a deployed preview site.

The green **CI** badge is the verification gate. Individual artifacts from a red, canceled, or
still-running workflow are not verified previews. Historical runs created before this feature
do not contain the Mac artifact; a first new green run is required. A failed new candidate leaves
earlier green runs and downloads intact. Both preview artifacts expire after 30 days (or sooner
if the repository's retention limit is shorter), so this is not permanent archival. GitHub login
and repository read access are required to download artifacts. This is a public source repository;
any signed-in GitHub user with read access can download its Actions artifacts. Mac packaging is
therefore off by default: it only runs when the repository variable
`YONDER_PUBLIC_PREVIEW_ARTIFACTS` is explicitly set to `true`. Leave it unset for strictly private
previews. The existing Web artifact and CI queue policy don't depend on the variable.

## Scheduling and limits

A `main` push pins one commit for the full CI run. The active run is not canceled by later pushes;
GitHub Actions keeps at most one pending run per group and a later enqueued push replaces it.
Once a run starts, it may complete and become the newest verified candidate even when newer code
has arrived. Manual and PR runs have separate groups and do not produce a preview disk image.
The fixed Actions view is ordered by run creation, not by which old run finished most recently.
GitHub does not guarantee dispatch order or queue latency. Aim for 10–20 minutes from push to
verified preview, but don't interrupt an active run solely to meet that target.

The image contains the existing CI **ad-hoc signed, not notarized** app, and it has the same
application identity as the stable build. It is a test artifact, not a supported installer for
external users: macOS may block it, and it should not replace a stable installation. No production
keys, GitHub Release, version tag, OSS or updater manifest, TestFlight, or deployment is involved.
