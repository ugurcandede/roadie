# Recipes

The four step types — `local`, `transfer`, `remote`, `confirm` — compose into
real deploy pipelines. The example below exercises every variation; smaller
patterns follow.

## Real-world deploy example

Three projects in one config:

- `backend-api` — JVM jar deploy with full `ssh` block + per-OS commands + confirm gate + sha256 round-trip verify.
- `frontend-app` — Next.js tarball deploy with a staging dir + sha256 + remote extract + local cleanup. Uses `ssh: { host }` alone (relies on `~/.ssh/config`).
- `lint-and-test` — local-only checks with no `ssh` block at all.

```json
{
  "projects": [
    {
      "name": "backend-api",
      "cwd": {
        "win": "C:\\projects\\backend-api",
        "default": "~/projects/backend-api"
      },
      "ssh": {
        "host": "api.preprod.internal",
        "user": "deploy",
        "port": 22,
        "identityFile": {
          "win": "C:\\Users\\me\\.ssh\\id_ed25519",
          "default": "~/.ssh/id_ed25519"
        }
      },
      "steps": [
        {
          "name": "Gradle clean & assemble",
          "type": "local",
          "run": {
            "win": ".\\gradlew clean assemble",
            "default": "./gradlew clean assemble"
          }
        },
        {
          "name": "Rename jar",
          "type": "local",
          "cwd": "build/libs",
          "run": {
            "win": "pwsh -Command \"Move-Item app-*-all.jar app-latest.jar\"",
            "default": "mv app-*-all.jar app-latest.jar"
          }
        },
        {
          "name": "Generate sha256",
          "type": "local",
          "cwd": "build/libs",
          "run": {
            "win": "pwsh -Command \"$h = (Get-FileHash -Algorithm SHA256 app-latest.jar).Hash.ToLower(); Set-Content -Path app-latest.jar.sha256 -Encoding ascii -NoNewline -Value ($h + '  app-latest.jar' + [char]10)\"",
            "default": "shasum -a 256 app-latest.jar > app-latest.jar.sha256"
          }
        },
        {
          "name": "Wait for old process to stop",
          "type": "confirm",
          "prompt": "Old jar stopped (pkill -f app-latest.jar)? Enter to continue."
        },
        {
          "name": "Upload jar",
          "type": "transfer",
          "from": "build/libs/app-latest.jar",
          "to": "/srv/app/app-latest.jar"
        },
        {
          "name": "Upload checksum",
          "type": "transfer",
          "from": "build/libs/app-latest.jar.sha256",
          "to": "/srv/app/app-latest.jar.sha256"
        },
        {
          "name": "Verify sha256 on remote",
          "type": "remote",
          "cwd": "/srv/app",
          "run": "sha256sum -c app-latest.jar.sha256"
        }
      ],
      "notify": "Start on remote:\n  java -jar /srv/app/app-latest.jar &\n\nChecksum: /srv/app/app-latest.jar.sha256"
    },

    {
      "name": "frontend-app",
      "cwd": {
        "win": "C:\\projects\\frontend-app",
        "default": "~/projects/frontend-app"
      },
      "ssh": { "host": "ui.preprod.internal" },
      "steps": [
        {
          "name": "Build",
          "type": "local",
          "run": {
            "win": "pwsh -Command \"Copy-Item .env.production.example .env.production.local && yarn next build\"",
            "default": "cp .env.production.example .env.production.local && yarn next build"
          }
        },
        {
          "name": "Remove .next/cache",
          "type": "local",
          "run": {
            "win": "if exist .next\\cache rd /s /q .next\\cache",
            "default": "rm -rf .next/cache"
          }
        },
        {
          "name": "Ensure staging dir",
          "type": "local",
          "cwd": "..",
          "run": {
            "win": "if not exist staging mkdir staging",
            "default": "mkdir -p staging"
          }
        },
        {
          "name": "Remove old tarball",
          "type": "local",
          "cwd": "..",
          "run": {
            "win": "if exist staging\\frontend-app.tar.xz del staging\\frontend-app.tar.xz",
            "default": "rm -f staging/frontend-app.tar.xz"
          }
        },
        {
          "name": "Create tar archive",
          "type": "local",
          "cwd": "..",
          "run": {
            "win": "tar --xz --options=\"xz:compression-level=2,threads=0\" -cf staging/frontend-app.tar.xz frontend-app",
            "default": "tar -cf - frontend-app | xz -T0 -2 -c > staging/frontend-app.tar.xz"
          }
        },
        {
          "name": "Generate sha256",
          "type": "local",
          "cwd": "..",
          "run": {
            "win": "pwsh -Command \"$h = (Get-FileHash -Algorithm SHA256 staging/frontend-app.tar.xz).Hash.ToLower(); Set-Content -Path staging/frontend-app.tar.xz.sha256 -Encoding ascii -NoNewline -Value ($h + '  frontend-app.tar.xz' + [char]10)\"",
            "default": "cd staging && shasum -a 256 frontend-app.tar.xz > frontend-app.tar.xz.sha256"
          }
        },
        {
          "name": "Wait for old process to stop",
          "type": "confirm",
          "prompt": "Old yarn start stopped? Enter to continue."
        },
        {
          "name": "Upload tar",
          "type": "transfer",
          "from": "../staging/frontend-app.tar.xz",
          "to": "/srv/app/frontend-app.tar.xz"
        },
        {
          "name": "Upload checksum",
          "type": "transfer",
          "from": "../staging/frontend-app.tar.xz.sha256",
          "to": "/srv/app/frontend-app.tar.xz.sha256"
        },
        {
          "name": "Verify sha256 on remote",
          "type": "remote",
          "cwd": "/srv/app",
          "run": "sha256sum -c frontend-app.tar.xz.sha256"
        },
        {
          "name": "Clean stale build on remote",
          "type": "remote",
          "cwd": "/srv/app",
          "run": "rm -rf frontend-app/.next"
        },
        {
          "name": "Extract on remote",
          "type": "remote",
          "cwd": "/srv/app",
          "run": "tar -xJf frontend-app.tar.xz"
        },
        {
          "name": "Cleanup local staging",
          "type": "local",
          "cwd": "..",
          "run": {
            "win": "if exist staging rd /s /q staging",
            "default": "rm -rf staging"
          }
        }
      ],
      "notify": "Start on remote:\n  cd /srv/app/frontend-app && yarn start\n\nChecksum: /srv/app/frontend-app.tar.xz.sha256"
    },

    {
      "name": "lint-and-test",
      "cwd": ".",
      "steps": [
        { "name": "Lint",  "type": "local", "run": "npm run lint" },
        { "name": "Tests", "type": "local", "run": "npm test" }
      ]
    }
  ]
}
```

### What each pattern does

**Per-OS `cwd`** — Same project at different absolute paths per OS. Resolved at config load; `default` is the fallback when the running platform isn't listed. Aliases: `mac`/`macos`/`osx`/`darwin`, `win`/`windows`/`win32`, `linux`. `~` is expanded.

```json
"cwd": { "win": "C:\\projects\\app", "default": "~/projects/app" }
```

**Per-OS `run`** — Same shape as per-OS paths, but `~` is **not** expanded (the shell handles that for shell commands). Use when build/install commands differ across cmd / sh / pwsh.

```json
"run": { "win": ".\\gradlew clean assemble", "default": "./gradlew clean assemble" }
```

**`ssh: { host }` only** — When `~/.ssh/config` defines the user, port, identity file for an alias, roadie uses them. Skip what you don't need to override.

```json
"ssh": { "host": "ui.preprod.internal" }
```

**Full `ssh` block** — Override per-project. Every field except `host` is optional; `identityFile` accepts the same per-OS object as paths.

```json
"ssh": {
  "host": "api.preprod.internal",
  "user": "deploy",
  "port": 22,
  "identityFile": { "win": "C:\\Users\\me\\.ssh\\id_ed25519", "default": "~/.ssh/id_ed25519" }
}
```

**Step `cwd`** — Per-step working directory, relative to `project.cwd`. `..` walks up one level (handy for tar archive creation from the parent dir).

```json
{ "name": "Create tar archive", "type": "local", "cwd": "..", "run": "tar -cf staging/app.tar.xz app" }
```

**`confirm` step** — Pauses until the user presses Enter. Use as a manual gate before destructive operations the user wants to control (stop old process, run migrations, etc.). No `ssh` required.

```json
{ "name": "Wait", "type": "confirm", "prompt": "Old process stopped? Enter to continue." }
```

**SHA256 round-trip verify** — Hash locally, transfer the artifact AND the `.sha256` file, then verify on remote. If hashes mismatch, the pipeline aborts before any subsequent (e.g., restart) step runs. Same pattern works with `openssl dgst -sha256` or `gpg --verify` for signatures.

```json
{ "name": "Generate sha256", "type": "local", "run": "shasum -a 256 app.jar > app.jar.sha256" },
{ "name": "Upload artifact", "type": "transfer", "from": "app.jar",        "to": "/srv/app/app.jar" },
{ "name": "Upload checksum", "type": "transfer", "from": "app.jar.sha256", "to": "/srv/app/app.jar.sha256" },
{ "name": "Verify on remote","type": "remote",   "cwd": "/srv/app", "run": "sha256sum -c app.jar.sha256" }
```

**Staging dir** — For tarball deploys, build the archive in a sibling directory so the project root stays clean. A final `local` step removes the staging dir after success; on failure the dir survives for inspection.

```json
{ "name": "Ensure staging dir", "type": "local", "cwd": "..", "run": "mkdir -p staging" },
{ "name": "Create tar archive", "type": "local", "cwd": "..", "run": "tar -cf staging/app.tar.xz app" },
{ "name": "Cleanup local staging", "type": "local", "cwd": "..", "run": "rm -rf staging" }
```

**Multi-line `notify`** — `\n` for line breaks. Printed AFTER the green `DEPLOY OK` banner; only fires on success. The CLI `--message="..."` flag overrides for one-off runs.

```json
"notify": "Start on remote:\n  java -jar /srv/app/app.jar &\n\nChecksum: /srv/app/app.jar.sha256"
```

---

## Patterns not in the example

### Wait for service health (poll then fail fast)

After restarting a remote service, block until it actually serves — but cap the wait so a stuck service doesn't hang the deploy forever.

```json
{
  "name": "Wait for ready", "type": "remote",
  "run": "for i in $(seq 1 30); do curl -fsS localhost:8080/health && exit 0; sleep 1; done; exit 1"
}
```

30 attempts, 1 s apart. `curl -fsS` returns non-zero on HTTP errors. If the service never comes up, the step fails and the deploy banner goes red.

### Atomic swap with a release directory

For zero-downtime style deploys: upload to a timestamped release dir, then flip a symlink. Rollback = re-point the symlink to a previous release.

```json
"steps": [
  { "name": "Make release",   "type": "remote",   "run": "TS=$(date +%Y%m%d-%H%M%S); mkdir -p /srv/releases/$TS; echo $TS > /tmp/roadie-ts" },
  { "name": "Upload",         "type": "transfer", "from": "dist/.", "to": "/srv/releases/staging/" },
  { "name": "Promote",        "type": "remote",   "run": "TS=$(cat /tmp/roadie-ts); mv /srv/releases/staging /srv/releases/$TS && ln -sfn /srv/releases/$TS /srv/current" },
  { "name": "Reload",         "type": "remote",   "run": "sudo systemctl reload nginx" }
]
```

The timestamp is captured in `/tmp/roadie-ts` because roadie's steps run in independent shells and can't share variables. Rollback: `ln -sfn /srv/releases/<old-TS> /srv/current && sudo systemctl reload nginx`.
