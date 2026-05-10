/**
 * test/integration.test.js
 *
 * Runs every project in config.test.json against the local Docker
 * sshd sandbox (started by test/setup.sh). Asserts result.ok === true.
 *
 *   1) test/setup.sh                          # one-time: keypair + container
 *   2) cp config.test.example.json config.test.json
 *   3) (edit projects to point to localhost:2222 with the test key)
 *   4) node --test test/integration.test.js
 *
 * Override the test config path with TEST_CONFIG=<path>.
 * Skip the sandbox precheck with SKIP_PROBE=1 (use only if you know what you're doing).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const { loadConfig } = require('../lib/config');
const { runProject } = require('../lib/runner');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = process.env.TEST_CONFIG || path.join(PROJECT_ROOT, 'config.test.json');
const SANDBOX_KEY = path.join(PROJECT_ROOT, 'test', 'sandbox', 'keys', 'id_test');

function fail(msg) {
    process.stderr.write(`\n${msg}\n`);
    process.exit(1);
}

if (!fs.existsSync(CONFIG_PATH)) {
    fail(
        `Test config not found: ${CONFIG_PATH}\n` +
        `First: cp config.test.example.json config.test.json\n` +
        `(Or set TEST_CONFIG=<path> to point at a different file.)`,
    );
}

if (!process.env.SKIP_PROBE) {
    if (!fs.existsSync(SANDBOX_KEY)) {
        fail(
            `Sandbox key missing: ${SANDBOX_KEY}\n` +
            `Run test/setup.sh first.`,
        );
    }
    const probe = spawnSync('ssh', [
        '-i', SANDBOX_KEY,
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=3',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-p', '2222',
        'deploy@localhost',
        'true',
    ], { stdio: 'pipe' });
    if (probe.status !== 0) {
        const err = probe.stderr ? probe.stderr.toString().trim() : `exit ${probe.status}`;
        fail(
            `Sandbox connection probe failed (deploy@localhost:2222)\n` +
            `Error: ${err}\n` +
            `Fix: run test/setup.sh`,
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
