/**
 * test/cli.test.js
 * Spawn-based smoke tests for the roadie CLI surface (--validate, --help,
 * --list, unknown args). Verifies wiring between roadie.js, lib/cli.js, and
 * lib/config.js without touching SSH or the runner.
 *
 *   node --test test/cli.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ENTRY = path.join(__dirname, '..', 'roadie.js');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'roadie-cli-test-'));

test.after(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

let counter = 0;
function withConfig(content) {
    const file = path.join(TMP_DIR, `cfg-${counter++}.json`);
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
    return file;
}

function spawnRoadie(args) {
    return spawnSync('node', [ENTRY, ...args], { encoding: 'utf8' });
}

// --- --validate ------------------------------------------------------------

test('--validate exits 0 and prints summary for a valid config', () => {
    const cfg = withConfig({
        projects: [
            { name: 'a', steps: [{ name: 's', type: 'local', run: 'true' }] },
            { name: 'b', ssh: { host: 'h', user: 'u' }, steps: [{ name: 's', type: 'remote', run: 'true' }] },
        ],
    });
    const r = spawnRoadie(['--validate', `--config=${cfg}`]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /Config OK/);
    assert.match(r.stdout, /2 projects, 2 steps total/);
    assert.match(r.stdout, /1 local, 0 transfer, 1 remote/);
});

test('--validate exits 1 with "Config error" for invalid config', () => {
    const cfg = withConfig({ projects: [] });
    const r = spawnRoadie(['--validate', `--config=${cfg}`]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Config error/);
    assert.match(r.stderr, /non-empty "projects" array/);
});

test('--validate exits 1 with "Config not found" when config file missing', () => {
    const r = spawnRoadie(['--validate', `--config=${path.join(TMP_DIR, 'missing.json')}`]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Config not found/);
    assert.match(r.stderr, /First: roadie --init/);
});

// --- --help / --list / unknown args ----------------------------------------

test('--help exits 0 and lists every flag', () => {
    const r = spawnRoadie(['--help']);
    assert.equal(r.status, 0);
    for (const flag of ['--project', '--message', '--list', '--validate', '--init', '--config', '--help']) {
        assert.match(r.stdout, new RegExp(flag.replace(/-/g, '\\-')), `--help missing ${flag}`);
    }
});

test('-h is an alias for --help', () => {
    const r = spawnRoadie(['-h']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Interactive menu/);
});

test('--list prints project names from a valid config', () => {
    const cfg = withConfig({
        projects: [
            { name: 'alpha', steps: [{ name: 's', type: 'local', run: 'true' }] },
            { name: 'beta',  steps: [{ name: 's', type: 'local', run: 'true' }] },
        ],
    });
    const r = spawnRoadie(['--list', `--config=${cfg}`]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /alpha/);
    assert.match(r.stdout, /beta/);
});

test('unknown argument exits 2 with help and "Unknown argument"', () => {
    const r = spawnRoadie(['--frobnicate']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Unknown argument: --frobnicate/);
});
