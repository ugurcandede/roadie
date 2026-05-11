/**
 * test/integration.test.js
 *
 * Runs every project in the sandbox config against the local Docker sshd
 * sandbox. Asserts result.ok === true. Projects containing a `confirm` step
 * are SKIPPED (they would hang waiting for stdin in a test runner).
 *
 *   1) node roadie.js --sandbox-up               # one-time: keypair + container
 *   2) node --test test/integration.test.js
 *
 * By default uses `config.sandbox.json` if it exists (your customized copy),
 * otherwise falls back to `config.sandbox.example.json` (the tracked example).
 * Override the path with TEST_CONFIG=<path>.
 * Skip the sandbox precheck with SKIP_PROBE=1.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const { loadConfig } = require('../lib/config');
const { runProject } = require('../lib/runner');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SANDBOX_CONFIG = path.join(PROJECT_ROOT, 'config.sandbox.json');
const SANDBOX_EXAMPLE = path.join(PROJECT_ROOT, 'config.sandbox.example.json');
const CONFIG_PATH = process.env.TEST_CONFIG
    || (fs.existsSync(SANDBOX_CONFIG) ? SANDBOX_CONFIG : SANDBOX_EXAMPLE);
const SANDBOX_KEY = path.join(PROJECT_ROOT, 'test', 'sandbox', 'keys', 'id_test');

function fail(msg) {
    process.stderr.write(`\n${msg}\n`);
    process.exit(1);
}

if (!fs.existsSync(CONFIG_PATH)) {
    fail(
        `Sandbox config not found: ${CONFIG_PATH}\n` +
        `Expected ${SANDBOX_EXAMPLE} (tracked) or ${SANDBOX_CONFIG} (your copy).`,
    );
}

if (!process.env.SKIP_PROBE) {
    if (!fs.existsSync(SANDBOX_KEY)) {
        fail(
            `Sandbox key missing: ${SANDBOX_KEY}\n` +
            `Run: node roadie.js --sandbox-up`,
        );
    }
    // Raw TCP banner probe via a child node process — sshd's "SSH-2.0-..."
    // identification line. Avoids invoking the system ssh client (Windows
    // OpenSSH has a quoting quirk surfacing as "Connection to UNKNOWN port -1").
    const bannerScript = `
        const net = require('net');
        const s = net.createConnection({ host: '127.0.0.1', port: 2222 });
        let buf = '';
        s.on('data', (d) => {
            buf += d.toString();
            if (buf.includes('\\n')) { s.destroy(); process.stdout.write(buf.split('\\n')[0]); process.exit(0); }
        });
        s.on('error', () => process.exit(2));
        setTimeout(() => process.exit(3), 3000);
    `;
    const probe = spawnSync(process.execPath, ['-e', bannerScript], { encoding: 'utf8' });
    if (probe.status !== 0 || !probe.stdout || !probe.stdout.startsWith('SSH-')) {
        fail(
            `Sandbox not reachable at 127.0.0.1:2222 (no SSH banner).\n` +
            `Fix: node roadie.js --sandbox-up`,
        );
    }
}

let config;
try {
    config = loadConfig(CONFIG_PATH);
} catch (e) {
    fail(`Test config could not be loaded: ${e.message}`);
}

if (config.projects.length === 0) {
    fail('No projects defined in test config.');
}

for (const project of config.projects) {
    if (project.steps.some((s) => s.type === 'confirm')) {
        test(`integration: ${project.name}`, { skip: 'has confirm step (run manually)' }, () => {});
        continue;
    }
    test(`integration: ${project.name}`, async () => {
        const result = await runProject(project, {});
        assert.equal(
            result.ok,
            true,
            `Project "${project.name}" failed (${result.completed}/${result.total} steps): ${result.error || ''}`,
        );
        assert.equal(
            result.completed,
            project.steps.length,
            `Completed step count mismatch: ${result.completed}/${project.steps.length}`,
        );
    });
}
