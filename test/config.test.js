/**
 * test/config.test.js
 * Unit tests for lib/config.js — loadConfig + every validation rule.
 * Pure tests; no Docker, no SSH, no shell. Just JSON in, parsed config out.
 *
 *   node --test test/config.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadConfig } = require('../lib/config');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'roadie-config-test-'));

test.after(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

let counter = 0;
function withConfig(content) {
    const file = path.join(TMP_DIR, `cfg-${counter++}.json`);
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    fs.writeFileSync(file, text);
    return file;
}

// --- happy paths -----------------------------------------------------------

test('loads a minimal valid config', () => {
    const c = loadConfig(withConfig({
        projects: [{ name: 'p', steps: [{ name: 's', type: 'local', run: 'true' }] }],
    }));
    assert.equal(c.projects.length, 1);
    assert.equal(c.projects[0].name, 'p');
    assert.equal(c.projects[0].steps.length, 1);
    assert.equal(c.projects[0].steps[0].type, 'local');
});

test('loads a full config with ssh, notify, transfer, remote', () => {
    const c = loadConfig(withConfig({
        projects: [{
            name: 'frontend',
            cwd: '.',
            notify: 'check the health endpoint',
            ssh: { host: 'h', user: 'u', port: 2222, identityFile: '~/.ssh/id_rsa' },
            steps: [
                { name: 'b', type: 'local',    run: 'npm run build' },
                { name: 'u', type: 'transfer', from: 'dist', to: '/var/www' },
                { name: 'r', type: 'remote',   run: 'sudo systemctl reload nginx' },
            ],
        }],
    }));
    const p = c.projects[0];
    assert.equal(p.notify, 'check the health endpoint');
    assert.equal(p.ssh.host, 'h');
    assert.equal(p.ssh.port, 2222);
    assert.match(p.ssh.identityFile, /id_rsa$/);
    // transfer.from is kept as-is (relative); the runner does path.resolve at exec time
    assert.equal(p.steps[1].from, 'dist');
    assert.equal(p.steps[2].run, 'sudo systemctl reload nginx');
});

test('per-OS cwd resolves for current platform', () => {
    const want = process.platform;
    const cwd = { mac: '/m', linux: '/l', win: 'C:\\w' };
    cwd[want === 'darwin' ? 'mac' : want === 'win32' ? 'win' : 'linux'] = '/here';
    const cfg = withConfig({
        projects: [{
            name: 'p', cwd,
            steps: [{ name: 's', type: 'local', run: 'true' }],
        }],
    });
    const c = loadConfig(cfg);
    assert.equal(c.projects[0].cwd, path.resolve(path.dirname(cfg), '/here'));
});

test('per-OS cwd falls back to "default" when current platform is missing', () => {
    const cfg = withConfig({
        projects: [{
            name: 'p', cwd: { default: '/fallback' },
            steps: [{ name: 's', type: 'local', run: 'true' }],
        }],
    });
    const c = loadConfig(cfg);
    assert.equal(c.projects[0].cwd, path.resolve(path.dirname(cfg), '/fallback'));
});

// --- load errors -----------------------------------------------------------

test('rejects missing config file with ENOENT', () => {
    assert.throws(
        () => loadConfig(path.join(TMP_DIR, 'does-not-exist.json')),
        (err) => err.code === 'ENOENT' && /Config not found/.test(err.message),
    );
});

test('rejects malformed JSON', () => {
    assert.throws(() => loadConfig(withConfig('not json {')), /JSON parse error/);
});

// --- root structure --------------------------------------------------------

test('rejects non-object root', () => {
    // JSON string at root — typeof "foo" !== "object"
    assert.throws(() => loadConfig(withConfig('"foo"')), /Config root must be an object/);
});

test('rejects missing projects array', () => {
    assert.throws(() => loadConfig(withConfig({})), /non-empty "projects" array/);
});

test('rejects empty projects array', () => {
    assert.throws(() => loadConfig(withConfig({ projects: [] })), /non-empty "projects" array/);
});

test('rejects duplicate project names', () => {
    assert.throws(
        () => loadConfig(withConfig({
            projects: [
                { name: 'dup', steps: [{ name: 's', type: 'local', run: 'true' }] },
                { name: 'dup', steps: [{ name: 's', type: 'local', run: 'true' }] },
            ],
        })),
        /Duplicate project name: "dup"/,
    );
});

// --- project structure -----------------------------------------------------

test('rejects project missing name', () => {
    assert.throws(
        () => loadConfig(withConfig({ projects: [{ steps: [{ name: 's', type: 'local', run: 'true' }] }] })),
        /projects\[0\]\.name is required/,
    );
});

test('rejects project with empty steps', () => {
    assert.throws(
        () => loadConfig(withConfig({ projects: [{ name: 'p', steps: [] }] })),
        /must contain at least 1 step/,
    );
});

test('rejects notify of wrong type', () => {
    assert.throws(
        () => loadConfig(withConfig({
            projects: [{ name: 'p', notify: 123, steps: [{ name: 's', type: 'local', run: 'true' }] }],
        })),
        /notify must be a string/,
    );
});

// --- step structure --------------------------------------------------------

test('rejects step with invalid type', () => {
    assert.throws(
        () => loadConfig(withConfig({
            projects: [{ name: 'p', steps: [{ name: 's', type: 'wat', run: 'true' }] }],
        })),
        /type is invalid: "wat"/,
    );
});

test('rejects local step missing run', () => {
    assert.throws(
        () => loadConfig(withConfig({
            projects: [{ name: 'p', steps: [{ name: 's', type: 'local' }] }],
        })),
        /\(local\): "run" is required/,
    );
});

test('rejects transfer step missing from/to', () => {
    assert.throws(
        () => loadConfig(withConfig({
            projects: [{
                name: 'p',
                ssh: { host: 'h', user: 'u' },
                steps: [{ name: 's', type: 'transfer', from: 'x' }],
            }],
        })),
        /\(transfer\): "to" is required/,
    );
});

test('rejects remote step when project has no ssh config', () => {
    assert.throws(
        () => loadConfig(withConfig({
            projects: [{ name: 'p', steps: [{ name: 's', type: 'remote', run: 'true' }] }],
        })),
        /project has no "ssh" config/,
    );
});

test('rejects transfer step when project has no ssh config', () => {
    assert.throws(
        () => loadConfig(withConfig({
            projects: [{ name: 'p', steps: [{ name: 's', type: 'transfer', from: 'a', to: 'b' }] }],
        })),
        /project has no "ssh" config/,
    );
});

// --- ssh structure ---------------------------------------------------------

test('rejects ssh missing host', () => {
    assert.throws(
        () => loadConfig(withConfig({
            projects: [{
                name: 'p', ssh: { user: 'u' },
                steps: [{ name: 's', type: 'remote', run: 'true' }],
            }],
        })),
        /ssh\.host is required/,
    );
});

test('rejects ssh missing user', () => {
    assert.throws(
        () => loadConfig(withConfig({
            projects: [{
                name: 'p', ssh: { host: 'h' },
                steps: [{ name: 's', type: 'remote', run: 'true' }],
            }],
        })),
        /ssh\.user is required/,
    );
});

test('rejects ssh.port out of range', () => {
    assert.throws(
        () => loadConfig(withConfig({
            projects: [{
                name: 'p', ssh: { host: 'h', user: 'u', port: 99999 },
                steps: [{ name: 's', type: 'remote', run: 'true' }],
            }],
        })),
        /ssh\.port is invalid/,
    );
});

// --- per-OS path errors ----------------------------------------------------

test('rejects unknown platform key in PathLike object', () => {
    assert.throws(
        () => loadConfig(withConfig({
            projects: [{
                name: 'p', cwd: { amiga: '/x' },
                steps: [{ name: 's', type: 'local', run: 'true' }],
            }],
        })),
        /unknown platform key "amiga"/,
    );
});

test('rejects PathLike object that does not cover current platform and has no default', () => {
    const want = process.platform;
    // Build an object that intentionally OMITS the current platform
    const cwd = {};
    if (want !== 'darwin') cwd.mac = '/m';
    if (want !== 'linux') cwd.linux = '/l';
    if (want !== 'win32') cwd.win = '/w';
    assert.throws(
        () => loadConfig(withConfig({
            projects: [{
                name: 'p', cwd,
                steps: [{ name: 's', type: 'local', run: 'true' }],
            }],
        })),
        /no path defined for this platform/,
    );
});
