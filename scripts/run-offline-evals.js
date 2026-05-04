#!/usr/bin/env node

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const nodeCommand = process.execPath;

function runOrExit(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNpmScript(scriptName) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    runOrExit(nodeCommand, [npmExecPath, 'run', scriptName]);
    return;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  runOrExit(npmCommand, ['run', scriptName], {
    shell: process.platform === 'win32'
  });
}

const forwardedArgs = process.argv.slice(2);
runNpmScript('compile:tests');
runOrExit(nodeCommand, ['out-test/test/evals/cli.js', ...forwardedArgs]);
