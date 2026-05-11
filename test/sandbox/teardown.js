#!/usr/bin/env node
/**
 * test/sandbox/teardown.js
 * Stop the sandbox container + clean known_hosts. Cross-platform.
 *
 *   node test/sandbox/teardown.js
 *   node roadie.js --sandbox-down    (same thing via the CLI)
 */

const { spawnSync } = require('child_process');

const SANDBOX_DIR = __dirname;

const down = spawnSync('docker', ['compose', 'down'], { stdio: 'inherit', cwd: SANDBOX_DIR });
if (down.status !== 0) {
    process.stderr.write('docker compose down failed.\n');
    process.exit(1);
}

spawnSync('ssh-keygen', ['-R', '[localhost]:2222'], { stdio: 'pipe' });

process.stdout.write('✓ Sandbox stopped, known_hosts cleaned.\n');
