<div align="center">
  <img src="docs/assets/logo.svg" alt="roadie" width="100" height="100">
  <h1>Roadie</h1>
  <p><em>When CI/CD is down, the roadie ships it.</em></p>
  <p>Local-build + SSH-deploy orchestrator. One JSON config per repo, multiple projects, scriptable steps. Cross-platform, zero npm dependencies.</p>
  <br>
  <img src="https://img.shields.io/badge/Node.js-stdlib%20only-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js stdlib only">
  <img src="https://img.shields.io/badge/macOS-000?style=flat-square&logo=apple&logoColor=white" alt="macOS">
  <img src="https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black" alt="Linux">
  <img src="https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=data:image/svg%2Bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0zIDUuNUwxMCA0LjVWMTEuNUgzVjUuNU0xMSA0LjVMMjEgM1YxMS41SDExVjQuNU0zIDEyLjVIMTBWMTkuNUwzIDE4LjVWMTIuNU0xMSAxMi41SDIxVjIxTDExIDE5LjVWMTIuNVoiLz48L3N2Zz4=" alt="Windows">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License: MIT"></a>
</div>

## What it solves

CI/CD exists but the test environment is flaky and you keep deploying by hand:
build locally, copy the artifact, restart the service, check it. This script
turns those manual steps into a reproducible per-project pipeline you trigger
from a TUI menu (or non-interactively from another script).

## Quick start

```bash
# 1. Generate an example config in the current directory.
node roadie.js --init                              # → roadie.config.example.json

# 2. Copy it and edit projects/steps for your apps.
cp roadie.config.example.json roadie.config.json

# 3. Run the interactive menu (↑↓ to pick, enter to deploy).
node roadie.js
```

## Prerequisites

- **Node.js 18+** (stdlib only — no `npm install`)
- **OpenSSH client** (`ssh`, `scp`) on PATH
    - macOS / Linux: built-in
    - Windows: built-in on Windows 10+ (Optional Feature: "OpenSSH Client")
- **Key-based SSH** to your target servers (ssh-agent or `identityFile`).
  Password auth is intentionally not supported (`BatchMode=yes`).

## Commands

```bash
node roadie.js                       # interactive menu
node roadie.js --project=<name>      # run a specific project, non-interactive
node roadie.js --message="..."       # success-only message (overrides project.notify)
node roadie.js --list                # print every project + its steps
node roadie.js --validate            # check the config schema (no run); summary on success
node roadie.js --init                # write roadie.config.example.json
node roadie.js --config=<path>       # use a non-default config (default: roadie.config.json)
node roadie.js --help
```

Exit codes:

| Code | Meaning                                           |
|------|---------------------------------------------------|
| 0    | Success (deploy finished or `--validate` passed)  |
| 1    | Step failure, config error, or validation failure |
| 2    | Unknown CLI argument (help is printed to stderr)  |

The first failing step stops the run.

## At a glance — minimal config

```json
{
  "projects": [
    {
      "name": "my-app",
      "ssh": { "host": "test.internal", "user": "deploy" },
      "steps": [
        { "name": "Build",  "type": "local",    "run": "npm run build" },
        { "name": "Upload", "type": "transfer", "from": "dist/.", "to": "/var/www/app/" },
        { "name": "Reload", "type": "remote",   "run": "sudo systemctl reload nginx" }
      ]
    }
  ]
}
```

Three step types: `local` (shell command here), `transfer` (`scp -r`),
`remote` (shell command on the SSH target). Full schema, per-OS paths,
notify-on-success, and the validation rules are documented separately.

## Documentation

- [**Configuration**](docs/configuration.md) — full schema, step types, per-OS paths, ssh block, notify, `--validate`
- [**Recipes**](docs/recipes.md) — sha256 round-trip verify, build manifests, atomic swap, health-check polling
- [**Testing**](docs/testing.md) — three-layer test strategy + Docker sshd sandbox setup

## Layout

```
roadie/
├── LICENSE                              # MIT
├── README.md
├── roadie.js                            # thin CLI entry — calls lib/cli.run()
├── roadie.config.example.json           # `--init` writes this
├── roadie.config.test.example.json      # template for the integration sandbox
├── docs/
│   ├── configuration.md
│   ├── recipes.md
│   ├── testing.md
│   └── assets/logo.svg
├── lib/
│   ├── cli.js                           # arg parsing + --help/--init/--list/--validate + main flow
│   ├── colors.js                        # ANSI palette + bell
│   ├── config.js                        # JSON load + schema validation
│   ├── display.js                       # progress UI: header, per-step status, banner, notice
│   ├── menu.js                          # raw-TTY single-select project picker
│   ├── paths.js                         # ~ expansion + per-OS PathLike resolution
│   ├── runner.js                        # sequential step executor (local/transfer/remote)
│   └── ssh.js                           # spawn wrappers around system ssh / scp
└── test/
    ├── cli.test.js                      # spawn-based CLI smoke tests
    ├── config.test.js                   # unit tests for loadConfig + every validation rule
    ├── integration.test.js              # end-to-end against the Docker sandbox
    ├── setup.sh                         # build + start the sandbox
    ├── teardown.sh                      # stop sandbox + clean known_hosts
    └── sandbox/
        ├── Dockerfile                   # alpine + openssh + sudo, key-only deploy user
        └── docker-compose.yml           # 127.0.0.1:2222 → 22
```

## Notes and limitations

- **No password auth.** SSH runs with `BatchMode=yes`, so the deploy never
  hangs on a password prompt. Use ssh-agent, `identityFile`, or
  `~/.ssh/config`.
- **First-connection host keys** are accepted (`StrictHostKeyChecking=accept-new`)
  and stored in your known_hosts. Subsequent host-key changes will fail loudly.
- **Steps run sequentially**, in order. The first failing step aborts the run
  and emits a red banner with the failing command's exit code.
- **`FORCE_COLOR=0`** is set for local steps so build tools don't smear ANSI
  codes through the indented output.
- **No remote artifact verification** beyond what your own `remote` steps
  check. If you want post-deploy validation, see the [verify recipe](docs/recipes.md#verifying-transfers-sha256-round-trip).
