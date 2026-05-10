/**
 * lib/menu.js
 * <pre>
 * Raw-TTY single-select menu for picking a project.
 *   ↑/↓        — move
 *   enter      — confirm
 *   q / esc    — cancel
 *   1-9        — quick-pick by index
 * </pre>
 */

const readline = require('readline');
const { C, key } = require('./colors');

function renderFrame(projects, cursor) {
    const lines = [];
    const sep = `${C.dim}│${C.reset}`;
    const hint = (k, desc) => `${key(k)} ${C.dim}${desc}${C.reset}`;
    lines.push('');
    lines.push(`${C.bold}Pick a project to deploy${C.reset}`);
    lines.push(
        `  ${hint('↑↓', 'move')}   ${sep}   ` +
        `${hint('enter', 'select')}   ${sep}   ` +
        `${hint('1-9', 'quick')}   ${sep}   ` +
        `${hint('q', 'cancel')}`
    );
    lines.push('');
    projects.forEach((p, i) => {
        const isCursor = i === cursor;
        const marker = isCursor ? `${C.brightCyan}${C.bold}>${C.reset}` : ' ';
        const num = `${C.dim}${(i + 1).toString().padStart(2, ' ')}.${C.reset}`;
        const labelColor = isCursor ? `${C.bold}${C.white}` : C.white;
        const detail = p.ssh
            ? `${C.dim}${p.ssh.user}@${p.ssh.host}${p.ssh.port ? ':' + p.ssh.port : ''}${C.reset}`
            : `${C.dim}local${C.reset}`;
        const stepCount = `${C.dim}${p.steps.length} steps${C.reset}`;
        lines.push(`${marker} ${num} ${labelColor}${p.name.padEnd(28)}${C.reset}  ${detail}  ${stepCount}`);
    });
    lines.push('');
    return lines;
}

async function pickProject(projects) {
    if (!process.stdin.isTTY) {
        throw new Error('Interactive menu requires a TTY. Use --project=<name> or --list.');
    }

    let cursor = 0;
    let lastLines = 0;

    function paint() {
        if (lastLines > 0) {
            process.stdout.write(`\x1b[${lastLines}A\x1b[0J`);
        }
        const lines = renderFrame(projects, cursor);
        process.stdout.write(lines.join('\n') + '\n');
        lastLines = lines.length;
    }

    return new Promise((resolve) => {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.resume();

        const cleanup = ({ clearMenu = true } = {}) => {
            if (clearMenu && lastLines > 0) {
                process.stdout.write(`\x1b[${lastLines}A\x1b[0J`);
                lastLines = 0;
            }
            process.stdin.removeListener('keypress', onKey);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write(C.reset);
        };

        const onKey = (str, k) => {
            if (!k) return;
            if (k.ctrl && k.name === 'c') {
                cleanup();
                return resolve(null);
            }
            switch (k.name) {
                case 'q':
                case 'escape':
                    cleanup();
                    return resolve(null);
                case 'up':
                    cursor = (cursor - 1 + projects.length) % projects.length;
                    return paint();
                case 'down':
                    cursor = (cursor + 1) % projects.length;
                    return paint();
                case 'home':
                    cursor = 0;
                    return paint();
                case 'end':
                    cursor = projects.length - 1;
                    return paint();
                case 'return':
                case 'enter':
                    cleanup();
                    return resolve(projects[cursor]);
            }
            // numeric quick-pick
            if (str && /^[1-9]$/.test(str)) {
                const idx = parseInt(str, 10) - 1;
                if (idx < projects.length) {
                    cleanup();
                    return resolve(projects[idx]);
                }
            }
        };

        process.stdin.on('keypress', onKey);
        paint();
    });
}

module.exports = { pickProject };
