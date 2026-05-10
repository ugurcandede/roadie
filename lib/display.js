/**
 * lib/display.js
 * stdout rendering for the runner — project header, per-step status,
 * streamed sub-process output (indented), success/failure banner, and the
 * post-deploy notice. No domain logic; the runner calls into here.
 */

const { C, stepTag, bell } = require('./colors');

function fmtMs(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function header(project) {
    const line = '─'.repeat(Math.max(8, project.name.length + 4));
    process.stdout.write('\n');
    process.stdout.write(`  ${C.bold}${project.name}${C.reset}\n`);
    process.stdout.write(`  ${C.dim}${line}${C.reset}\n`);
    if (project.ssh) {
        const target = `${project.ssh.user ? project.ssh.user + '@' : ''}${project.ssh.host}${project.ssh.port ? ':' + project.ssh.port : ''}`;
        process.stdout.write(`  ${C.dim}ssh:${C.reset} ${target}\n`);
    }
    process.stdout.write(`  ${C.dim}cwd:${C.reset} ${project.cwd}\n`);
    process.stdout.write('\n');
}

function startStep(index, total, step) {
    const idx = `${C.dim}[${index + 1}/${total}]${C.reset}`;
    process.stdout.write(`${stepTag('running')}  ${idx} ${C.bold}${step.name}${C.reset} ${C.dim}(${step.type})${C.reset}\n`);
}

function endStep(status, durationMs, errorMsg) {
    const tag = stepTag(status);
    const dur = `${C.dim}${fmtMs(durationMs)}${C.reset}`;
    if (status === 'success') {
        process.stdout.write(`   ${tag} ${C.brightGreen}done${C.reset} ${dur}\n\n`);
    } else if (status === 'failed') {
        process.stdout.write(`   ${tag} ${C.brightRed}failed${C.reset} ${dur}\n`);
        if (errorMsg) {
            for (const line of String(errorMsg).split(/\r?\n/)) {
                if (line) process.stdout.write(`     ${C.red}${line}${C.reset}\n`);
            }
        }
        process.stdout.write('\n');
    } else {
        process.stdout.write(`   ${tag} ${status} ${dur}\n\n`);
    }
}

function indent(line, stream) {
    const color = stream === 'stderr' ? C.yellow : C.dim;
    process.stdout.write(`     ${color}${line}${C.reset}\n`);
}

function probeStart() {
    process.stdout.write(`${C.dim}  ssh probe…${C.reset}`);
}
function probeOk() {
    process.stdout.write(`\r${C.brightGreen}  ✓ ssh ok${C.reset}     \n\n`);
}
function probeFail() {
    process.stdout.write(`\r${C.brightRed}  ✗ ssh fail${C.reset}\n`);
}

function announce(ok, project, completed, total, durationMs) {
    const color = ok ? C.brightGreen : C.brightRed;
    const label = ok ? 'DEPLOY OK' : 'DEPLOY FAILED';
    const detail = ok
        ? `${total} steps, ${fmtMs(durationMs)}`
        : `${completed}/${total} steps, ${fmtMs(durationMs)}`;
    const inner = `  ${label}  ·  ${project.name}  ·  ${detail}  `;
    const bar = '═'.repeat(inner.length);
    process.stdout.write('\n');
    process.stdout.write(`${color}${bar}${C.reset}\n`);
    process.stdout.write(`${color}${C.bold}${inner}${C.reset}\n`);
    process.stdout.write(`${color}${bar}${C.reset}\n`);
    process.stdout.write('\n');
    bell();
}

function printSuccessNotice(project, cliMessage) {
    // CLI flag overrides project.notify; either may be omitted.
    const text = cliMessage != null ? cliMessage : (project.notify || null);
    const remoteSteps = project.steps.filter((s) => s.type === 'remote' || s.type === 'transfer');
    if (!text && remoteSteps.length === 0) return;

    if (text) {
        process.stdout.write(`${C.bold}${C.brightYellow}NOTE${C.reset}  ${text}\n\n`);
    }
    if (remoteSteps.length > 0) {
        const tag = project.ssh
            ? `${project.ssh.user ? project.ssh.user + '@' : ''}${project.ssh.host}${project.ssh.port ? ':' + project.ssh.port : ''}`
            : '';
        process.stdout.write(`${C.bold}Steps executed on remote${C.reset}` +
            (tag ? ` ${C.dim}(${tag})${C.reset}` : '') + `\n`);
        for (const s of remoteSteps) {
            const detail = s.type === 'transfer' ? `${s.from} → ${s.to}` : s.run;
            process.stdout.write(`  ${C.dim}${s.type.padEnd(8)}${C.reset} ${C.brightCyan}${s.name}${C.reset}\n`);
            process.stdout.write(`           ${C.dim}${detail}${C.reset}\n`);
        }
        process.stdout.write('\n');
    }
}

module.exports = {
    header,
    startStep,
    endStep,
    indent,
    probeStart,
    probeOk,
    probeFail,
    announce,
    printSuccessNotice,
    fmtMs,
};
