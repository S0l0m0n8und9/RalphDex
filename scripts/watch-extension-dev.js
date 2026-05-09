const { spawn } = require('node:child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];

function start(label, args) {
  const child = spawn(npmCommand, args, {
    stdio: 'inherit',
    shell: false
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const other of children) {
      if (other !== child && !other.killed) {
        other.kill();
      }
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
  child.on('error', (error) => {
    console.error(`${label} watcher failed to start: ${error.message}`);
    if (!shuttingDown) {
      shuttingDown = true;
      for (const other of children) {
        if (other !== child && !other.killed) {
          other.kill();
        }
      }
    }
    process.exit(1);
  });
}

let shuttingDown = false;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) {
        child.kill(signal);
      }
    }
  });
}

start('webview', ['run', 'watch:webview']);
start('typescript', ['run', 'watch:ts']);
