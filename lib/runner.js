/**
 * lib/runner.js
 * Sequentially execute a project's steps. Streams sub-process output to stdout
 * (via display.indent), stops at the first failure. Pure orchestration; all
 * formatting lives in lib/display.js.
 */

const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const { runRemote, copyToRemote, probe } = require('./ssh');
const { expandHome } = require('./paths');
const {
    header, startStep, endStep, indent,
    probeStart, probeOk, probeFail,
    announce, printSuccessNotice,
} = require('./display');

function runLocal(step, project) {
    const cwd = step.cwd
        ? path.resolve(project.cwd, expandHome(step.cwd))
        : project.cwd;
    return new Promise((resolve, reject) => {
        const proc = spawn(step.run, {
            cwd,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, FORCE_COLOR: '0' },
        });
        proc.stdout.on('data', (d) => {
            for (const line of d.toString('utf8').split(/\r?\n/)) {
                if (line) indent(line, 'stdout');
            }
        });
        proc.stderr.on('data', (d) => {
            for (const line of d.toString('utf8').split(/\r?\n/)) {
                if (line) indent(line, 'stderr');
            }
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`exit ${code}: ${step.run}`));
        });
    });
}

async function runTransfer(step, project) {
    const local = path.resolve(project.cwd, expandHome(step.from));
    indent(`${local} → ${step.to}`, 'stdout');
    const result = await copyToRemote(project.ssh, local, step.to, {
        onLine: (line, stream) => indent(line, stream),
    });
    if (result.exitCode !== 0) {
        throw new Error(`scp exit ${result.exitCode}`);
    }
}

async function runRemoteStep(step, project) {
    const result = await runRemote(project.ssh, step.run, {
        cwd: step.cwd,
        onLine: (line, stream) => indent(line, stream),
    });
    if (result.exitCode !== 0) {
        throw new Error(`remote exit ${result.exitCode}: ${step.run}`);
    }
}

function runConfirm(step) {
    return new Promise((resolve) => {
        indent(step.prompt, 'stdout');
        const rl = readline.createInterface({ input: process.stdin });
        rl.once('line', () => {
            rl.close();
            resolve();
        });
    });
}

async function runProject(project, opts = {}) {
    const { quiet = false, message = null } = opts;
    if (!quiet) header(project);

    if (project.ssh) {
        probeStart();
        try {
            await probe(project.ssh);
            probeOk();
        } catch (e) {
            probeFail();
            return { ok: false, error: e.message, completed: 0, total: project.steps.length };
        }
    }

    const totalStart = Date.now();
    let completed = 0;

    for (let i = 0; i < project.steps.length; i++) {
        const step = project.steps[i];
        startStep(i, project.steps.length, step);
        const stepStart = Date.now();
        try {
            if (step.type === 'local')         await runLocal(step, project);
            else if (step.type === 'transfer') await runTransfer(step, project);
            else if (step.type === 'remote')   await runRemoteStep(step, project);
            else if (step.type === 'confirm')  await runConfirm(step);
            endStep('success', Date.now() - stepStart);
            completed++;
        } catch (e) {
            endStep('failed', Date.now() - stepStart, e.message);
            const total = Date.now() - totalStart;
            announce(false, project, completed, project.steps.length, total);
            return { ok: false, error: e.message, completed, total: project.steps.length };
        }
    }

    const totalMs = Date.now() - totalStart;
    announce(true, project, completed, project.steps.length, totalMs);
    printSuccessNotice(project, message);
    return { ok: true, completed, total: project.steps.length };
}

module.exports = { runProject };
