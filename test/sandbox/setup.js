#!/usr/bin/env node
/**
 * test/sandbox/setup.js
 * Cross-platform sandbox bootstrap. Idempotent — safe to re-run.
 *
 * Generates a throwaway ed25519 keypair, builds + starts the Docker sshd
 * container on 127.0.0.1:2222, waits for sshd, refreshes ~/.ssh/known_hosts,
 * and probes the connection. On Windows, also locks the key file ACL so
 * OpenSSH accepts it.
 *
 *   node test/sandbox/setup.js
 *   node roadie.js --sandbox-up    (same thing via the CLI)
 */

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');

const SANDBOX_DIR = __dirname;
const KEYS_DIR = path.join(SANDBOX_DIR, 'keys');
const KEY_PATH = path.join(KEYS_DIR, 'id_test');
const PUB_PATH = path.join(KEYS_DIR, 'id_test.pub');
const AUTH_KEYS = path.join(SANDBOX_DIR, 'authorized_keys');

function die(msg) {
    process.stderr.write(msg + '\n');
    process.exit(1);
}

function runInherit(cmd, args, opts = {}) {
    return spawnSync(cmd, args, { stdio: 'inherit', ...opts }).status;
}

function runCapture(cmd, args, opts = {}) {
    return spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts });
}

async function waitForSshBanner(host, port, maxAttempts = 60, intervalMs = 500) {
    // Connect, read up to a newline, check for the "SSH-2.0-..." identification.
    // This verifies sshd is fully handshake-ready, not just TCP-listening.
    for (let i = 0; i < maxAttempts; i++) {
        const banner = await new Promise((resolve) => {
            const sock = net.createConnection({ host, port });
            let buf = '';
            let done = false;
            const finish = (val) => { if (!done) { done = true; sock.destroy(); resolve(val); } };
            sock.on('data', (d) => {
                buf += d.toString('utf8');
                if (buf.includes('\n')) finish(buf);
            });
            sock.once('error', () => finish(null));
            setTimeout(() => finish(null), 2000);
        });
        if (banner && banner.startsWith('SSH-')) return banner.split('\n')[0].trim();
        process.stdout.write('.');
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
}

async function main() {
    if (runCapture('docker', ['--version']).status !== 0) {
        die('docker not found on PATH. Install Docker Desktop or Docker Engine.');
    }

    fs.mkdirSync(KEYS_DIR, { recursive: true });
    if (!fs.existsSync(KEY_PATH)) {
        process.stdout.write('✓ generating ed25519 keypair...\n');
        const r = runCapture('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', KEY_PATH, '-C', 'roadie-test', '-q']);
        if (r.status !== 0) die('ssh-keygen failed:\n' + (r.stderr || r.stdout));
    }

    if (process.platform === 'win32') {
        const user = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
        runCapture('icacls', [KEY_PATH, '/inheritance:r']);
        runCapture('icacls', [KEY_PATH, '/grant:r', `${user}:R`]);
        process.stdout.write('✓ key ACL locked to current user (Windows)\n');
    }

    fs.copyFileSync(PUB_PATH, AUTH_KEYS);

    process.stdout.write('→ docker compose up -d --build\n');
    if (runInherit('docker', ['compose', 'up', '-d', '--build'], { cwd: SANDBOX_DIR }) !== 0) {
        die('docker compose failed.');
    }

    process.stdout.write('→ waiting for sshd');
    const banner = await waitForSshBanner('127.0.0.1', 2222);
    process.stdout.write(banner ? ` ✓ ${banner}\n` : ' ✗ timeout\n');
    if (!banner) die('sshd never came up.');

    // Clear any stale known_hosts entry. roadie's probe uses StrictHostKeyChecking=accept-new
    // so it will re-learn the new container's host key on first connect.
    runCapture('ssh-keygen', ['-R', '[localhost]:2222']);

    process.stdout.write('\n✓ Sandbox ready.\n');
    process.stdout.write('  Manual demo:    node roadie.js --config=config.sandbox.example.json\n');
    process.stdout.write('  Integration:    node --test test/integration.test.js\n');
    process.stdout.write('  Raw ssh:        ssh -i test/sandbox/keys/id_test -p 2222 deploy@localhost\n');
    process.stdout.write('  Tear down:      node roadie.js --sandbox-down\n');
}

main().catch((e) => die(e.stack || e.message));
