/**
 * lib/paths.js
 * Path utilities — `~` expansion and per-OS PathLike resolution.
 * Used by config validation and the runner.
 *
 * <pre>
 * <PathLike> = string                                    // same on every OS
 *            | { mac|linux|win: string, default?: ... }  // per-OS, ~ expanded per entry
 *   Aliases: mac|macos|osx|darwin, win|windows|win32, linux. "default" / "*" = fallback.
 * </pre>
 */

const path = require('path');
const os = require('os');

const PLATFORM_ALIASES = {
    mac: 'darwin', macos: 'darwin', osx: 'darwin', darwin: 'darwin',
    win: 'win32', windows: 'win32', win32: 'win32',
    linux: 'linux',
    default: 'default', '*': 'default',
};

function expandHome(p) {
    if (typeof p !== 'string') return p;
    if (p === '~') return os.homedir();
    if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
    return p;
}

/**
 * Pick a per-OS value (string or { mac, linux, win, default } object) for the current platform.
 * No `~` expansion — caller decides whether that applies (paths: yes, shell commands: no).
 * Throws when the object form does not cover the current platform and has no default.
 * Returns null when value is null/undefined (caller decides if that's an error).
 */
function pickPlatform(value, fieldName) {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(
            `${fieldName} must be a string or { mac, linux, win, default } object`
        );
    }
    const want = process.platform;          // 'darwin' | 'linux' | 'win32' | …
    const canonical = {};
    for (const [k, v] of Object.entries(value)) {
        const norm = PLATFORM_ALIASES[k.toLowerCase()];
        if (!norm) {
            throw new Error(
                `${fieldName}: unknown platform key "${k}" ` +
                `(valid: mac, linux, win, default)`
            );
        }
        if (typeof v !== 'string') {
            throw new Error(`${fieldName}.${k} must be a string`);
        }
        canonical[norm] = v;
    }
    const picked = canonical[want] != null ? canonical[want] : canonical.default;
    if (picked == null) {
        const have = Object.keys(canonical).join(', ') || '(none)';
        throw new Error(
            `${fieldName}: no value defined for this platform (${want}) ` +
            `and no "default" fallback. Defined: ${have}`
        );
    }
    return picked;
}

/**
 * Resolve a PathLike to an absolute-ish path string for the current platform.
 * Same as `pickPlatform` plus `~` expansion.
 */
function resolvePlatformPath(value, fieldName) {
    const picked = pickPlatform(value, fieldName);
    return picked == null ? null : expandHome(picked);
}

module.exports = { expandHome, resolvePlatformPath, pickPlatform, PLATFORM_ALIASES };
