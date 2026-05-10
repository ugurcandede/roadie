# Testing

Three layers, all on the built-in `node:test` runner — no test framework
dependency. Two are fast and self-contained (no Docker, no SSH); the third
hits a real sshd in a local container.

| Layer       | File                       | What it covers                                       | Needs Docker |
|-------------|----------------------------|------------------------------------------------------|:------------:|
| Unit        | `test/config.test.js`      | Every `loadConfig` validation rule (happy + error)   |      no      |
| CLI smoke   | `test/cli.test.js`         | `--validate`, `--help`, `--list`, unknown-arg wiring |      no      |
| Integration | `test/integration.test.js` | Each project runs end-to-end against a local sshd    |   **yes**    |

## Run the fast tests (unit + CLI)

No setup, no daemons. Good as a pre-commit check.

```bash
node --test test/config.test.js test/cli.test.js
```

Targets ~30 cases, runs in well under a second.

## Run the integration tests

Validates that a real project's steps actually work end-to-end before
pointing them at the real server. Spins up a local Docker sshd container
exposing `127.0.0.1:2222 → 22`.

```bash
# 1. One-time: generate a throwaway keypair and start the sandbox container.
test/setup.sh

# 2. Copy the test config example and edit it to mirror your real projects
#    (host=localhost, port=2222, identityFile=test/sandbox/keys/id_test).
cp config.test.example.json config.test.json

# 3. Run the integration tests.
node --test test/integration.test.js

# 4. When you're done.
test/teardown.sh
```

Each project in `config.test.json` becomes one test case; `runProject`
is called directly and `result.ok === true` is asserted.

### Sandbox container

`test/sandbox/Dockerfile` builds an Alpine image with `openssh` and `sudo`,
creates a passwordless `deploy` user with NOPASSWD sudo, and disables
password login. The Dockerfile bakes your generated public key into
`/home/deploy/.ssh/authorized_keys` at build time.

`test/setup.sh` handles: keypair generation (idempotent), image build,
container startup, sshd readiness probe, and known_hosts refresh
(removes stale `[localhost]:2222` entries before adding the new one).

`test/teardown.sh` brings the container down and wipes the known_hosts
entry. The generated keys/ folder is preserved unless you `rm -rf
test/sandbox/keys` manually.

### Knobs

| Env var       | Effect                                                      |
|---------------|-------------------------------------------------------------|
| `TEST_CONFIG` | Override the test config path (default `config.test.json`). |
| `SKIP_PROBE`  | Skip the pre-test SSH reachability check (rarely useful).   |

## Writing your own integration cases

Each top-level `projects[]` entry in `config.test.json` becomes one
`node:test` case — its name is `integration: <project name>`. Include
assertions inside `remote` steps (e.g. `test -f /tmp/payload.txt`) — those
exit non-zero on failure, which fails the step, which fails the project,
which fails the test.

The example file ships with three illustrative cases:

- **`sandbox-roundtrip`** — local file create → transfer → remote verify → cleanup.
- **`sandbox-directory-transfer`** — same but with `scp -r` of a directory.
- **`sandbox-sudo`** — `sudo tee` into `/var/lib/`, verify, cleanup.

Use these as a template; delete the ones you don't need and add cases that
mirror your production projects.
