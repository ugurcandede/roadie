#!/usr/bin/env node
/**
 * roadie.js
 * When CI/CD is down, the roadie ships it.
 * Local-build + SSH-deploy orchestrator. Cross-platform (Mac/Linux/Win10+).
 * Zero npm deps — uses system `ssh` and `scp`.
 *
 * Thin entry. All flow lives in lib/cli.js.
 */

const path = require('path');
const { run, EXAMPLE_FILE } = require('./lib/cli');
const { C } = require('./lib/colors');

run({ exampleSrc: path.join(__dirname, EXAMPLE_FILE) }).catch((e) => {
    process.stderr.write(`${C.red}Unexpected error:${C.reset} ${e.stack || e.message}\n`);
    process.exit(1);
});
