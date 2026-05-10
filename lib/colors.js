/**
 * lib/colors.js
 * ANSI color palette + small helpers. No deps.
 */

const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    brightCyan: '\x1b[96m',
    brightGreen: '\x1b[92m',
    brightYellow: '\x1b[93m',
    brightRed: '\x1b[91m',
};

const STEP_COLOR = {
    pending: C.dim,
    running: C.brightCyan,
    success: C.brightGreen,
    failed:  C.brightRed,
    skipped: C.dim,
};

const STEP_SYMBOL = {
    pending: '·',
    running: '▶',
    success: '✓',
    failed:  '✗',
    skipped: '○',
};

function paint(color, text) {
    return `${color}${text}${C.reset}`;
}

function key(label) {
    return `${C.bold}${C.brightCyan}${label}${C.reset}`;
}

function stepTag(status) {
    const color = STEP_COLOR[status] || C.dim;
    const sym = STEP_SYMBOL[status] || '?';
    return `${color}${sym}${C.reset}`;
}

function bell() {
    process.stdout.write('\x07');
}

module.exports = { C, STEP_COLOR, STEP_SYMBOL, paint, key, stepTag, bell };
