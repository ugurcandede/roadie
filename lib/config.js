/**
 * lib/config.js
 * Load + validate config.json.
 *
 * Schema:
 * <pre>
 * {
 *   "projects": [
 *     {
 *       "name": "string (unique)",
 *       "cwd":  <PathLike>,                     // optional, ~ expanded, relative to config dir
 *       "notify": "string",                     // optional — printed after successful deploy
 *       "ssh":  {                               // optional — only needed for type=transfer/remote
 *         "host": "string",
 *         "user": "string",
 *         "port": 22,                           // optional
 *         "identityFile": <PathLike>            // optional
 *       },
 *       "steps": [
 *         { "name": "label", "type": "local",    "run": "shell command", "cwd": <PathLike>     },
 *         { "name": "label", "type": "transfer", "from": <PathLike>,     "to": "remote path"   },
 *         { "name": "label", "type": "remote",   "run": "shell command", "cwd": "remote dir"   }
 *       ]
 *     }
 *   ]
 * }
 * </pre>
 *
 * For <PathLike> semantics see lib/paths.js.
 */

const fs = require('fs');
const path = require('path');

const { resolvePlatformPath } = require('./paths');

const VALID_TYPES = new Set(['local', 'transfer', 'remote']);

function loadConfig(configPath) {
    const abs = path.resolve(process.cwd(), configPath);
    if (!fs.existsSync(abs)) {
        const err = new Error(`Config not found: ${abs}`);
        err.code = 'ENOENT';
        throw err;
    }
    let raw;
    try {
        raw = fs.readFileSync(abs, 'utf8');
    } catch (e) {
        throw new Error(`Could not read config (${abs}): ${e.message}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        throw new Error(`Config JSON parse error (${abs}): ${e.message}`);
    }
    return validate(parsed, abs);
}

function validate(input, configPath) {
    const baseDir = path.dirname(configPath);
    if (!input || typeof input !== 'object') {
        throw new Error('Config root must be an object');
    }
    if (!Array.isArray(input.projects) || input.projects.length === 0) {
        throw new Error('Config must contain a non-empty "projects" array');
    }
    const seen = new Set();
    const projects = input.projects.map((p, i) => {
        const proj = validateProject(p, i, baseDir);
        if (seen.has(proj.name)) {
            throw new Error(`Duplicate project name: "${proj.name}"`);
        }
        seen.add(proj.name);
        return proj;
    });
    return { projects, configPath };
}

function validateProject(p, i, baseDir) {
    if (!p || typeof p !== 'object') {
        throw new Error(`projects[${i}] must be an object`);
    }
    if (typeof p.name !== 'string' || !p.name.trim()) {
        throw new Error(`projects[${i}].name is required (string)`);
    }
    if (!Array.isArray(p.steps) || p.steps.length === 0) {
        throw new Error(`projects[${i}] (${p.name}): "steps" must contain at least 1 step`);
    }
    const resolvedCwd = resolvePlatformPath(p.cwd, `${p.name}.cwd`);
    const out = {
        name: p.name.trim(),
        cwd: resolvedCwd ? path.resolve(baseDir, resolvedCwd) : baseDir,
    };
    if (p.notify != null) {
        if (typeof p.notify !== 'string') {
            throw new Error(`${p.name}.notify must be a string`);
        }
        out.notify = p.notify;
    }
    if (p.ssh != null) out.ssh = validateSsh(p.ssh, p.name);
    out.steps = p.steps.map((s, j) => validateStep(s, p.name, j, !!out.ssh));
    return out;
}

function validateSsh(s, projectName) {
    if (typeof s !== 'object') {
        throw new Error(`${projectName}.ssh must be an object`);
    }
    if (typeof s.host !== 'string' || !s.host.trim()) {
        throw new Error(`${projectName}.ssh.host is required`);
    }
    if (typeof s.user !== 'string' || !s.user.trim()) {
        throw new Error(`${projectName}.ssh.user is required`);
    }
    const out = { host: s.host.trim(), user: s.user.trim() };
    if (s.port != null) {
        if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535) {
            throw new Error(`${projectName}.ssh.port is invalid`);
        }
        out.port = s.port;
    }
    if (s.identityFile != null) {
        out.identityFile = resolvePlatformPath(s.identityFile, `${projectName}.ssh.identityFile`);
    }
    return out;
}

function validateStep(s, projectName, j, hasSsh) {
    if (!s || typeof s !== 'object') {
        throw new Error(`${projectName}.steps[${j}] must be an object`);
    }
    if (typeof s.name !== 'string' || !s.name.trim()) {
        throw new Error(`${projectName}.steps[${j}].name is required`);
    }
    if (!VALID_TYPES.has(s.type)) {
        throw new Error(
            `${projectName}.steps[${j}].type is invalid: "${s.type}" (valid: local, transfer, remote)`
        );
    }
    if ((s.type === 'transfer' || s.type === 'remote') && !hasSsh) {
        throw new Error(
            `${projectName}.steps[${j}] (${s.type}): project has no "ssh" config`
        );
    }
    if (s.type === 'local' || s.type === 'remote') {
        if (typeof s.run !== 'string' || !s.run.trim()) {
            throw new Error(`${projectName}.steps[${j}] (${s.type}): "run" is required`);
        }
        const out = { name: s.name.trim(), type: s.type, run: s.run };
        if (s.cwd != null) {
            // local: PathLike resolved now; remote: kept as-is (server-side path).
            if (s.type === 'local') {
                out.cwd = resolvePlatformPath(s.cwd, `${projectName}.steps[${j}].cwd`);
            } else {
                if (typeof s.cwd !== 'string') {
                    throw new Error(`${projectName}.steps[${j}].cwd must be a string for remote steps`);
                }
                out.cwd = s.cwd;
            }
        }
        return out;
    }
    // transfer
    const from = resolvePlatformPath(s.from, `${projectName}.steps[${j}].from`);
    if (!from || !from.trim()) {
        throw new Error(`${projectName}.steps[${j}] (transfer): "from" is required`);
    }
    if (typeof s.to !== 'string' || !s.to.trim()) {
        throw new Error(`${projectName}.steps[${j}] (transfer): "to" is required`);
    }
    return { name: s.name.trim(), type: 'transfer', from, to: s.to };
}

module.exports = { loadConfig };
