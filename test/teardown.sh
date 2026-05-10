#!/usr/bin/env bash
#
# test/teardown.sh — Stop the sandbox and remove its known_hosts entry.
# Keeps the generated keys/ around (delete manually if you want a fresh start).

set -euo pipefail

cd "$(dirname "$0")/sandbox"

echo "→ docker compose down"
docker compose down >/dev/null 2>&1 || true

ssh-keygen -R '[localhost]:2222' >/dev/null 2>&1 || true
rm -f authorized_keys

echo "✓ Sandbox down (keys/ kept — to remove: rm -rf test/sandbox/keys)"
