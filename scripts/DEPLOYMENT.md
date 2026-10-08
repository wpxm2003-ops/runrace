# Deployment and recovery

Run from the repository root after committing, testing and pushing to `origin/main`:

```sh
node scripts/deploy-backend.mjs
node scripts/deploy.mjs
```

The launchers reject tracked local modifications and revisions different from
`origin/main`. Untracked local configuration files are not uploaded. The backend
source archive comes from the exact verified commit, not the server working tree.

## Web

- Each checksum-verified archive is unpacked into `/var/www/runrace-releases/<id>`.
- Required HTML files and nginx configuration are checked before activation.
- `/var/www/runrace` points to the active release. Subsequent switches use an
  atomic symlink rename and do not require an nginx reload.
- The first deployment converts the existing directory to a preserved
  `legacy-<id>` release. This initial move/link pair has a short transition window;
  failure triggers restoration. Do not run an old deployment script afterwards:
  its recursive deletion would damage the release behind the symlink.
- Old hashed `_next/static` assets are retained for already-open browser tabs.
- Four local HTTPS routes must return the candidate's actual HTML, not merely 200.
  If a check fails, the previous pointer is restored and checked again.

The last successful release's rollback target is recorded in
`/var/www/runrace-releases/previous`. To manually restore, validate that this path
is a release directory containing the expected HTML; create a new symlink beside
`/var/www/runrace`, then replace the current symlink with `mv -Tf`. Verify HTTPS
routes afterwards. Never move a symlink over an unvalidated directory.

## Backend

- A per-backend lock prevents overlapping deployments.
- The current JAR is copied to
  `/home/ec2-user/runrace-backend-releases/<id>-previous.jar`.
- Build happens in a unique isolated directory, never with `clean` against the
  running application's `target`. Only that temporary build directory is deleted.
- The candidate replaces the installed JAR via rename before systemd restart.
- The script waits for an active service and `/actuator/health` status `UP`.
- Failure restores the previous JAR, restarts, and checks health again. Exit 1
  means deployment failed, even if rollback succeeded. Exit 2 signals failed
  rollback and requires immediate investigation.

For manual recovery, use the verified JAR path recorded in
`/home/ec2-user/runrace-backend-releases/previous`. Copy it to a temporary sibling
of `backend/target/backend-0.0.1-SNAPSHOT.jar`, rename over that JAR, restart
`runrace`, and verify health.

**JAR rollback does not roll back database migrations.** Deploy only
backwards-compatible migrations through this automatic recovery path. A web
failure also does not automatically roll back a successful backend deployment.

## Verification and retention

```sh
bash scripts/tests/deploy-remote.test.sh
```

Run on Linux. Tests use temporary directories with real git, tar, symlinks and
flock, but fake systemd/nginx/curl/Maven; no production service is touched.
`RUNRACE_WEB_ROOT` and `RUNRACE_REPO` support these isolated test roots. Production
launchers do not set these overrides.

Release archives, previous JARs and web releases are deliberately retained, not
automatically pruned. Monitor free disk space and remove only individually
validated obsolete releases, never the active or rollback target. Old static
assets carried into new releases also require periodic, deliberate retention
maintenance. A force-killed deploy or host failure can require manual recovery.
