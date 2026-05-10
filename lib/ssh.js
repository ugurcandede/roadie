/**
 * lib/ssh.js
 * Thin wrappers around system `ssh` and `scp` (cross-platform — Win 10+ ships OpenSSH).
 *
 * Auth: key-based only. Uses ssh-agent / default key locations / `identityFile`
 * if set. Password auth is intentionally not supported (would need sshpass).
 */

const { spawn } = require('child_process');
const fs = require('fs');

function buildSshArgs(ssh, extra = []) {
    const args = [
        '-o', 'BatchMode=yes',                 // never prompt for password
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'ServerAliveInterval=30',
    ];
    if (ssh.port) args.push('-p', String(ssh.port));
    if (ssh.identityFile) args.push('-i', ssh.identityFile);
    args.push(...extra);
    return args;
}

function buildScpArgs(ssh, extra = []) {
    const args = [
        '-o', 'BatchMode=yes',
        '-o', 'StrictHostKeyChecking=accept-new',
    ];
    if (ssh.port) args.push('-P', String(ssh.port));
    if (ssh.identityFile) args.push('-i', ssh.identityFile);
    args.push(...extra);
    return args;
}

/**
 * Run a command via ssh on the remote host.
 * @returns Promise<{ exitCode, signal }>
 */
function runRemote(ssh, command, { onLine, cwd } = {}) {
    const remoteCmd = cwd ? `cd ${shellQuote(cwd)} && ${command}` : command;
    const args = buildSshArgs(ssh, [`${ssh.user}@${ssh.host}`, remoteCmd]);
    return spawnStreaming('ssh', args, onLine);
}

/**
 * Copy a local file or directory to the remote host using scp -r.
 * @returns Promise<{ exitCode, signal }>
 */
function copyToRemote(ssh, localPath, remotePath, { onLine } = {}) {
    if (!fs.existsSync(localPath)) {
        return Promise.reject(new Error(`Yerel kaynak yok: ${localPath}`));
    }
    const target = `${ssh.user}@${ssh.host}:${remotePath}`;
    const args = buildScpArgs(ssh, ['-r', localPath, target]);
    return spawnStreaming('scp', args, onLine);
}

/**
 * Quick reachability probe (TCP + auth + harmless echo).
 * @returns Promise<true>  resolves on success, rejects with a helpful Error
 */
async function probe(ssh) {
    let stderr = '';
    const result = await runRemote(ssh, 'true', {
        onLine: (line, stream) => {
            if (stream === 'stderr') stderr += line + '\n';
        },
    });
    if (result.exitCode !== 0) {
        const hint = stderr.trim() || `ssh exit ${result.exitCode}`;
        throw new Error(`SSH connection probe failed (${ssh.user}@${ssh.host}): ${hint}`);
    }
    return true;
}

function spawnStreaming(cmd, args, onLine) {
    return new Promise((resolve, reject) => {
        let proc;
        try {
            proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (e) {
            return reject(e);
        }

        const emit = (chunk, stream) => {
            if (!onLine) return;
            const text = chunk.toString('utf8');
            for (const line of text.split(/\r?\n/)) {
                if (line.length > 0) onLine(line, stream);
            }
        };

        proc.stdout.on('data', (d) => emit(d, 'stdout'));
        proc.stderr.on('data', (d) => emit(d, 'stderr'));

        proc.on('error', (e) => {
            if (e.code === 'ENOENT') {
                reject(new Error(`"${cmd}" not found on PATH. Is the OpenSSH client installed?`));
            } else {
                reject(e);
            }
        });
        proc.on('close', (code, signal) => resolve({ exitCode: code, signal }));
    });
}

// Minimal POSIX-ish single-quote escaping for remote paths.
// Used inside `cd <path>` constructed for the remote shell.
function shellQuote(s) {
    if (/^[A-Za-z0-9_\-./~]+$/.test(s)) return s;
    return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

module.exports = { runRemote, copyToRemote, probe, shellQuote };
