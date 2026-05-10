# Configuration

A roadie config is one JSON file with a `projects` array. Each project has a
unique `name`, an optional working directory (`cwd`), an optional SSH target,
an optional success-path message (`notify`), and a list of `steps`.

## Schema example

```json
{
  "projects": [
    {
      "name": "frontend-test",
      "cwd": "~/work/my-frontend",
      "notify": "Smoke test: https://test.internal/health",
      "ssh": {
        "host": "test.internal",
        "user": "deploy",
        "port": 22,
        "identityFile": "~/.ssh/id_ed25519"
      },
      "steps": [
        { "name": "Install",      "type": "local",    "run": "npm ci" },
        { "name": "Build",        "type": "local",    "run": "npm run build" },
        { "name": "Clean remote", "type": "remote",   "run": "rm -rf /var/www/app/*" },
        { "name": "Upload dist",  "type": "transfer", "from": "dist/.", "to": "/var/www/app/" },
        { "name": "Reload nginx", "type": "remote",   "run": "sudo systemctl reload nginx" }
      ]
    }
  ]
}
```

`cwd` is resolved relative to the **config file's** directory, so a config
with `"cwd": "."` works the same wherever the file lives.

## Step types

| Type       | Fields                | Notes                                                                |
|------------|-----------------------|----------------------------------------------------------------------|
| `local`    | `run`, optional `cwd` | Shell command on this machine. Inherits env, `FORCE_COLOR=0`.        |
| `transfer` | `from`, `to`          | `scp -r` — file or directory. `from` resolved against project `cwd`. |
| `remote`   | `run`, optional `cwd` | `ssh user@host -- <run>`. `cwd` is the **server-side** path.         |

`transfer` and `remote` require a project-level `ssh` block. `local` does not —
you can write `scp preprodapi:...` or `rsync ...` as a `local` step and use
your own `~/.ssh/config` aliases without the `ssh` block at all.

## Per-OS paths

`project.cwd`, `step.cwd` (for `local`), `step.from` (for `transfer`), and
`ssh.identityFile` accept either a string (same on every OS) or an object
keyed by platform:

```json
"cwd": {
  "mac":     "~/work/my-app",
  "linux":   "/home/deploy/my-app",
  "win":     "C:\\dev\\my-app",
  "default": "~/my-app"
}
```

Aliases: `mac` / `macos` / `osx` / `darwin`, `win` / `windows` / `win32`,
`linux`. `default` (or `*`) is the fallback when no platform key matches.
A missing platform without a `default` errors out at config-load time.

## SSH block

| Field          | Required | Notes                                                              |
|----------------|:--------:|--------------------------------------------------------------------|
| `host`         |   yes    | Hostname or IP. Resolved against your `~/.ssh/config` if applicable. |
| `user`         |   yes    | Remote username.                                                   |
| `port`         |    no    | Defaults to 22.                                                    |
| `identityFile` |    no    | Path to private key. Accepts per-OS PathLike. ssh-agent works too. |

Password auth is intentionally not supported (`BatchMode=yes`). Use ssh-agent,
an explicit `identityFile`, or `~/.ssh/config` host entries.

## Notify on success

The optional `notify` string is printed **only after a successful run** —
right under the green `DEPLOY OK` banner. It's followed by an auto-generated
recap of every `transfer` and `remote` step that ran (with the actual command
and SSH target).

```json
"notify": "Smoke check: https://test.internal/health  ·  Did the CDN cache get purged?"
```

The `--message="..."` CLI flag overrides the project's `notify` for one-off
runs (e.g., when wiring roadie into an ad-hoc script).

## Validating a config

`roadie --validate` runs the full schema check and exits without doing any
work. Useful as a pre-commit hook or before sharing a config:

```bash
node roadie.js --validate --config=config.json
```

Exit `0` with a green `Config OK` summary on success; exit `1` with a
specific `Config error: ...` line pointing at the offending field on failure.
