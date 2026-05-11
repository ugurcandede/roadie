#!/usr/bin/env bash
# Bash shim — delegates to the cross-platform Node script.
# Prefer: node roadie.js --sandbox-up
exec node "$(dirname "$0")/sandbox/setup.js" "$@"
