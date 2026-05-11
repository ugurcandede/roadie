/**
 * lib/cli.js
 * Argv parsing, --help / --init / --list / --validate handlers, and the
 * top-level main() flow that wires config + menu + runner together.
 * roadie.js is a thin entry that just calls run().
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { loadConfig } = require('./config');
const { pickProject } = require('./menu');
const { runProject } = require('./runner');
const { C } = require('./colors');

const DEFAULT_CONFIG = 'config.json';
const EXAMPLE_FILE = 'config.example.json';

const TEMPLATE = `{
  "projects": [
    {
      "name": "my-app",
      "cwd": ".",
      "ssh": { "host": "" },
      "steps": [
        { "name": "Build",   "type": "local",    "run": "" },
        { "name": "Confirm", "type": "confirm",  "prompt": "Ready to deploy? Enter to continue." },
        { "name": "Upload",  "type": "transfer", "from": "", "to": "" },
        { "name": "Restart", "type": "remote",   "run": "" }
      ]
    }
  ]
}
`;

const KNOWN_FLAGS = new Set([
    '--list', '--init', '--validate', '--help', '-h',
    '--sandbox-up', '--sandbox-down',
]);
const KNOWN_OPTS = new Set([
    '--project', '--config', '--message',
]);

function parseArgs(argv) {
    const flags = new Set();
    const opts = {};
    const unknown = [];
    for (const arg of argv) {
        if (KNOWN_FLAGS.has(arg)) {
            flags.add(arg);
            continue;
        }
        const eq = arg.indexOf('=');
        if (arg.startsWith('--') && eq > 0) {
            const name = arg.slice(0, eq);
            const value = arg.slice(eq + 1);
            if (KNOWN_OPTS.has(name)) {
                opts[name.slice(2)] = value;
                continue;
            }
        }
        unknown.push(arg);
    }
    return { flags, opts, unknown };
}

function printHelp() {
    process.stdout.write(`${C.bold}roadie${C.reset} — when CI/CD is down, the roadie ships it

${C.bold}Usage${C.reset}
  roadie                               Interactive menu (pick a project)
  roadie --project=${C.dim}<name>${C.reset}              Run a specific project non-interactively
  roadie --message=${C.dim}"..."${C.reset}              Message printed on success (overrides project.notify)
  roadie --list                        List projects from config
  roadie --validate                    Validate the config schema and exit
  roadie --init                        Write ${DEFAULT_CONFIG} (template)
  roadie --config=${C.dim}<path>${C.reset}               Use a custom config path (default: ${DEFAULT_CONFIG})
  roadie --sandbox-up                  Bring up the Docker test sandbox (idempotent)
  roadie --sandbox-down                Stop the sandbox container
  roadie --help                        Show this help

${C.bold}Config schema${C.reset} — see ${EXAMPLE_FILE}

${C.bold}SSH${C.reset}
  Uses system ${C.dim}ssh${C.reset} and ${C.dim}scp${C.reset}. Key-based auth only;
  works with ssh-agent, an explicit ${C.dim}identityFile${C.reset}, or ~/.ssh/config.
`);
}

function writeInit(target) {
    if (fs.existsSync(target)) {
        process.stderr.write(`${C.yellow}${target} already exists, not overwritten.${C.reset}\n`);
        process.exit(1);
    }
    fs.writeFileSync(target, TEMPLATE);
    process.stdout.write(`${C.brightGreen}✓${C.reset} ${target} written.\n`);
    process.stdout.write(`  Edit it, then run ${C.bold}roadie${C.reset}.\n`);
}

function listProjects(config) {
    process.stdout.write(`\n${C.bold}Projects${C.reset} ${C.dim}(${config.configPath})${C.reset}\n\n`);
    config.projects.forEach((p, i) => {
        const num = `${C.dim}${(i + 1).toString().padStart(2, ' ')}.${C.reset}`;
        const target = p.ssh
            ? `${C.dim}${p.ssh.user ? p.ssh.user + '@' : ''}${p.ssh.host}${p.ssh.port ? ':' + p.ssh.port : ''}${C.reset}`
            : `${C.dim}local${C.reset}`;
        process.stdout.write(`  ${num} ${C.bold}${p.name.padEnd(28)}${C.reset}  ${target}  ${C.dim}${p.steps.length} steps${C.reset}\n`);
        for (const s of p.steps) {
            process.stdout.write(`        ${C.dim}· ${s.type.padEnd(8)}${C.reset} ${s.name}\n`);
        }
    });
    process.stdout.write('\n');
}

function reportValid(config) {
    const projectCount = config.projects.length;
    let stepCount = 0;
    const byType = { local: 0, transfer: 0, remote: 0, confirm: 0 };
    let withSsh = 0;
    let withNotify = 0;
    for (const p of config.projects) {
        stepCount += p.steps.length;
        if (p.ssh) withSsh++;
        if (p.notify) withNotify++;
        for (const s of p.steps) byType[s.type]++;
    }
    process.stdout.write(`${C.brightGreen}✓ Config OK${C.reset} ${C.dim}(${config.configPath})${C.reset}\n`);
    process.stdout.write(`  ${C.dim}${projectCount} projects, ${stepCount} steps total${C.reset}\n`);
    process.stdout.write(`  ${C.dim}steps:${C.reset} ${byType.local} local, ${byType.transfer} transfer, ${byType.remote} remote, ${byType.confirm} confirm\n`);
    process.stdout.write(`  ${C.dim}${withSsh} project(s) with ssh, ${withNotify} with notify${C.reset}\n`);
}

async function run() {
    const { flags, opts, unknown } = parseArgs(process.argv.slice(2));

    if (unknown.length > 0) {
        process.stderr.write(`${C.red}Unknown argument: ${unknown.join(' ')}${C.reset}\n\n`);
        printHelp();
        process.exit(2);
    }

    if (flags.has('--help') || flags.has('-h')) {
        printHelp();
        return;
    }

    if (flags.has('--init')) {
        writeInit(path.resolve(process.cwd(), DEFAULT_CONFIG));
        return;
    }

    if (flags.has('--sandbox-up') || flags.has('--sandbox-down')) {
        const script = flags.has('--sandbox-up') ? 'setup.js' : 'teardown.js';
        const target = path.join(__dirname, '..', 'test', 'sandbox', script);
        const r = spawnSync(process.execPath, [target], { stdio: 'inherit' });
        process.exit(r.status == null ? 1 : r.status);
    }

    const configPath = opts.config || DEFAULT_CONFIG;
    let config;
    try {
        config = loadConfig(configPath);
    } catch (e) {
        if (e.code === 'ENOENT') {
            process.stderr.write(`${C.red}${e.message}${C.reset}\n`);
            process.stderr.write(`${C.dim}First: roadie --init  →  edit ${DEFAULT_CONFIG}.${C.reset}\n`);
        } else {
            process.stderr.write(`${C.red}Config error: ${e.message}${C.reset}\n`);
        }
        process.exit(1);
    }

    if (flags.has('--validate')) {
        reportValid(config);
        return;
    }

    if (flags.has('--list')) {
        listProjects(config);
        return;
    }

    let project;
    if (opts.project) {
        project = config.projects.find((p) => p.name === opts.project);
        if (!project) {
            process.stderr.write(`${C.red}Project not found: "${opts.project}"${C.reset}\n`);
            process.stderr.write(`${C.dim}Available: ${config.projects.map((p) => p.name).join(', ')}${C.reset}\n`);
            process.exit(1);
        }
    } else {
        project = await pickProject(config.projects);
        if (!project) {
            process.stdout.write(`${C.dim}Cancelled.${C.reset}\n`);
            return;
        }
    }

    const runOpts = {};
    if (opts.message != null) runOpts.message = opts.message;
    const result = await runProject(project, runOpts);
    process.exit(result.ok ? 0 : 1);
}

module.exports = { run, parseArgs, EXAMPLE_FILE, DEFAULT_CONFIG };
