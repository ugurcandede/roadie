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

## Configuration

A config is one JSON file with a `projects` array. Each project has a `name`,
optional `cwd`, optional `ssh`, optional `notify`, and a `steps` list:

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
        {
          "name": "Install",
          "type": "local",
          "run": "npm ci"
        },
        {
          "name": "Build",
          "type": "local",
          "run": "npm run build"
        },
        {
          "name": "Clean remote",
          "type": "remote",
          "run": "rm -rf /var/www/app/*"
        },
        {
          "name": "Upload dist",
          "type": "transfer",
          "from": "dist/.",
          "to": "/var/www/app/"
        },
        {
          "name": "Reload nginx",
          "type": "remote",
          "run": "sudo systemctl reload nginx"
        }
      ]
    }
  ]
}
```

`cwd` is resolved relative to the config file's directory, so configs stay
portable across machines.

### Step types

| Type       | Fields                | Notes                                                                |
|------------|-----------------------|----------------------------------------------------------------------|
| `local`    | `run`, optional `cwd` | Shell command on this machine. Inherits env, `FORCE_COLOR=0`.        |
| `transfer` | `from`, `to`          | `scp -r` — file or directory. `from` resolved against project `cwd`. |
| `remote`   | `run`, optional `cwd` | `ssh user@host -- <run>`. `cwd` is the **server-side** path.         |

`transfer` and `remote` require a project-level `ssh` block. `local` does not —
you can write `scp preprodapi:...` or `rsync ...` as a `local` step and use
your own `~/.ssh/config` aliases without the `ssh` block at all.

### Per-OS paths

`project.cwd`, `step.cwd` (for `local`), `step.from` (for `transfer`), and
`ssh.identityFile` accept either a string (same on every OS) or an object
keyed by platform:

```json
"cwd": {
"mac": "~/work/my-app",
"linux": "/home/deploy/my-app",
"win":     "C:\\dev\\my-app",
"default": "~/my-app"
}
```

Aliases: `mac` / `macos` / `osx` / `darwin`, `win` / `windows` / `win32`,
`linux`. `default` (or `*`) is the fallback when no platform key matches.
A missing platform without a `default` errors out at config-load time.

### Notify on success

After a successful run the script prints (skipped on failure):

1. The optional `notify` string (or `--message="..."` if given — flag wins).
2. An auto-generated recap of every `transfer` and `remote` step that ran,
   including the actual command, prefixed with the SSH target.

Useful as a checklist or for paste-into-incident-channel after deploy.

## Tests

Three layers, all on the built-in `node:test` runner — no framework dep.

| Layer       | File                       | What it covers                                       | Needs Docker |
|-------------|----------------------------|------------------------------------------------------|:------------:|
| Unit        | `test/config.test.js`      | Every `loadConfig` validation rule (happy + error)   |      no      |
| CLI smoke   | `test/cli.test.js`         | `--validate`, `--help`, `--list`, unknown-arg wiring |      no      |
| Integration | `test/integration.test.js` | Each project runs end-to-end against a local sshd    |   **yes**    |

### Run unit + CLI tests

Fast, no setup. Good as a pre-commit check.

```bash
node --test test/config.test.js test/cli.test.js
```

### Run integration tests

Validates that a real project's steps actually work end-to-end before pointing
them at the real server. Spins up a local Docker sshd container.

```bash
# 1. One-time: generate a throwaway keypair and start the sandbox container.
test/setup.sh

# 2. Copy the test config example and edit it to mirror your real projects
#    (host=localhost, port=2222, identityFile=test/sandbox/keys/id_test).
cp roadie.config.test.example.json roadie.config.test.json

# 3. Run the integration tests.
node --test test/integration.test.js

# 4. When you're done.
test/teardown.sh
```

Each project in `roadie.config.test.json` becomes one test case; `runProject`
is called directly and `result.ok === true` is asserted.

Knobs: `TEST_CONFIG=<path>` to point at a different config file,
`SKIP_PROBE=1` to skip the pre-test SSH reachability check.

## Layout

```
roadie/
├── LICENSE                              # MIT
├── README.md
├── roadie.js                            # thin CLI entry — calls lib/cli.run()
├── roadie.config.example.json           # `--init` writes this
├── roadie.config.test.example.json      # template for the integration sandbox
├── docs/assets/logo.svg
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
  check. If you want post-deploy validation, add a `curl localhost/health`
  remote step at the end.
