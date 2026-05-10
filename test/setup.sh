#!/usr/bin/env bash
#
# test/setup.sh — Spin up the local sshd sandbox for integration tests.
#
#   1) Generates a throwaway ed25519 keypair at test/sandbox/keys/id_test
#   2) Bakes the public key into the image at build time
#   3) Starts the container exposing 127.0.0.1:2222 -> 22
#   4) Refreshes the local known_hosts entry for [localhost]:2222
#
# Re-run idempotently. Use test/teardown.sh to stop and clean up.

set -euo pipefail

cd "$(dirname "$0")/sandbox"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found. Install Docker Desktop or Docker Engine." >&2
  exit 1
fi

mkdir -p keys
if [ ! -f keys/id_test ]; then
  ssh-keygen -t ed25519 -N '' -f keys/id_test -C 'roadie-test' >/dev/null
  echo "✓ generated test keypair: test/sandbox/keys/id_test"
fi

cp keys/id_test.pub authorized_keys

echo "→ docker compose up -d --build"
docker compose up -d --build >/dev/null

# Wait for sshd to accept connections (alpine boots quickly but allow margin).
echo -n "→ waiting for sshd"
for i in $(seq 1 30); do
  if (echo > /dev/tcp/127.0.0.1/2222) 2>/dev/null; then
    echo " ✓"
    break
  fi
  echo -n "."
  sleep 0.3
done

# Refresh known_hosts (container key changes on rebuild).
ssh-keygen -R '[localhost]:2222' >/dev/null 2>&1 || true
ssh-keyscan -p 2222 -t ed25519 localhost 2>/dev/null >> "$HOME/.ssh/known_hosts" || true

# Final probe with the actual key — fail loudly if anything is off.
if ! ssh -i keys/id_test \
        -o BatchMode=yes \
        -o ConnectTimeout=5 \
        -o StrictHostKeyChecking=accept-new \
        -p 2222 deploy@localhost true; then
  echo "✗ sandbox connection probe failed" >&2
  exit 1
fi

echo
echo "✓ Sandbox ready."
echo "  Manual test:  ssh -i test/sandbox/keys/id_test -p 2222 deploy@localhost"
echo "  Run tests:    node --test test/integration.test.js"
echo "  Tear down:    test/teardown.sh"
