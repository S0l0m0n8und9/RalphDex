#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const compiledEntryPoint = path.join(__dirname, '..', 'out', 'validation', 'checkDocs.js');

if (!fs.existsSync(compiledEntryPoint)) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const compileResult = spawnSync(npmCommand, ['run', 'compile'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });

  if (compileResult.status !== 0) {
    process.exit(compileResult.status ?? 1);
  }
}

require(compiledEntryPoint);
