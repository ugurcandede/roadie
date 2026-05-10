# Recipes

These aren't features — they're patterns you can build out of the existing
`local` / `transfer` / `remote` step types. Roadie keeps the surface small on
purpose; common deployment niceties live here as composable examples.

## Verifying transfers (sha256 round-trip)

`transfer` is a thin wrapper around `scp` and doesn't checksum what it sent.
For uploads where corruption matters, hash locally before upload and verify
on the remote side using the standard `sha256sum -c`:

```json
{
  "name": "verified-deploy",
  "ssh": { "host": "...", "user": "..." },
  "steps": [
    { "name": "Build + sha",      "type": "local",    "run": "tar czf dist.tgz dist/ && sha256sum dist.tgz > dist.tgz.sha256" },
    { "name": "Upload artifact",  "type": "transfer", "from": "dist.tgz",        "to": "/tmp/dist.tgz" },
    { "name": "Upload checksum",  "type": "transfer", "from": "dist.tgz.sha256", "to": "/tmp/dist.tgz.sha256" },
    { "name": "Verify on remote", "type": "remote",   "run": "cd /tmp && sha256sum -c dist.tgz.sha256" },
    { "name": "Activate",         "type": "remote",   "run": "sudo systemctl restart my-app" }
  ]
}
```

`sha256sum -c` exits non-zero on mismatch, so the step fails and the deploy
aborts **before** the "Activate" step ever runs. Same pattern works with
`shasum -a 256`, `openssl dgst -sha256`, or `gpg --verify` for signatures.

## Build manifest in the deploy notice

To leave an audit trail of which artifacts were shipped, capture hashes in
the build step and surface them in the success output:

```json
{
  "name": "Build", "type": "local",
  "run": "npm run build && sha256sum dist/* | tee build-manifest.txt"
}
```

The manifest is streamed inline in the indented step output **and** saved
next to your artifacts. Reference its location from the project's `notify`
field if you want the post-deploy checklist to point at it:

```json
"notify": "Build manifest: ./build-manifest.txt  ·  Smoke: https://test.internal/health"
```

## Wait for service health (poll then fail fast)

After restarting a remote service, block until it's actually serving — but
cap the wait so a stuck service doesn't hang the deploy forever:

```json
{
  "name": "Wait for ready", "type": "remote",
  "run": "for i in $(seq 1 30); do curl -fsS localhost:8080/health && exit 0; sleep 1; done; exit 1"
}
```

30 attempts, 1 second apart. `curl -fsS` returns non-zero on HTTP errors, so
the loop only "succeeds" on a real 2xx response. If the service never comes
up, the step fails and the deploy banner goes red.

## Atomic swap with a release directory

For zero-downtime style deploys: upload to a sibling directory, then flip a
symlink. If the new release fails to start, the previous one is still on disk
to roll back to.

```json
{
  "name": "atomic-swap-deploy",
  "ssh": { "host": "...", "user": "..." },
  "steps": [
    { "name": "Build",          "type": "local",    "run": "npm run build" },
    { "name": "Make release",   "type": "remote",   "run": "mkdir -p /var/www/releases/$(date +%Y%m%d-%H%M%S)" },
    { "name": "Upload",         "type": "transfer", "from": "dist/.", "to": "/var/www/releases/latest-staging/" },
    { "name": "Promote",        "type": "remote",   "run": "ln -sfn /var/www/releases/latest-staging /var/www/current" },
    { "name": "Reload",         "type": "remote",   "run": "sudo systemctl reload nginx" }
  ]
}
```

For real atomic semantics you'd want unique per-release dirs (the timestamp
trick above) wired into the symlink target — left as an exercise so the
recipe stays short.
