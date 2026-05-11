# Testing

Three layers, all on the built-in `node:test` runner — no framework. Two are
fast and self-contained; the third hits a real sshd in a local container.

| Layer       | File                       | What it covers                                       | Needs Docker |
|-------------|----------------------------|------------------------------------------------------|:------------:|
| Unit        | `test/config.test.js`      | Every `loadConfig` validation rule (happy + error)   |      no      |
| CLI smoke   | `test/cli.test.js`         | `--validate`, `--help`, `--list`, `--init`, etc.     |      no      |
| Integration | `test/integration.test.js` | Each sandbox project runs end-to-end against sshd    |   **yes**    |

## Fast tests

```bash
node --test test/config.test.js test/cli.test.js
```

Runs in well under a second.

## Integration tests (sandbox)

Spins up a Docker sshd container on `127.0.0.1:2222` and runs every project
in `config.sandbox.example.json` against it. Projects containing a `confirm`
step are SKIPPED (would hang waiting for stdin).

```bash
# 1. Bring up the sandbox (idempotent).
node roadie.js --sandbox-up

# 2. Run the tests.
node --test test/integration.test.js

# 3. Tear down when you're done.
node roadie.js --sandbox-down
```

`--sandbox-up` is a cross-platform Node script (`test/sandbox/setup.js`) that
checks Docker, generates a throwaway ed25519 keypair at
`test/sandbox/keys/id_test`, locks its ACL on Windows (OpenSSH refuses
loose-permission keys), builds + starts the container, refreshes
`~/.ssh/known_hosts`, and probes the connection.

### Manual sandbox deploy

The same `config.sandbox.example.json` ships with a `sandbox-demo` project
that demonstrates the full deploy flow (sha256 verify + confirm gate). Run
it directly:

```bash
node roadie.js --config=config.sandbox.example.json --project=sandbox-demo
```

Or pick it from the menu (`node roadie.js --config=config.sandbox.example.json`).

### Customizing the sandbox config

`config.sandbox.example.json` is the tracked default. If you want to
customize without touching the example, copy it to `config.sandbox.json`
(gitignored):

```bash
cp config.sandbox.example.json config.sandbox.json
# edit config.sandbox.json
```

Integration tests prefer `config.sandbox.json` over the example when it
exists. `TEST_CONFIG=<path>` overrides both.

### Sandbox container

`test/sandbox/Dockerfile` builds Alpine + openssh + sudo, creates a
passwordless `deploy` user with NOPASSWD sudo, disables password login, and
bakes the generated public key into `authorized_keys` at build time.

### Knobs

| Env var       | Effect                                                                |
|---------------|-----------------------------------------------------------------------|
| `TEST_CONFIG` | Override the sandbox config path (default: `config.sandbox.json` if it exists, else `config.sandbox.example.json`). |
| `SKIP_PROBE`  | Skip the pre-test SSH reachability check (rarely useful).             |
