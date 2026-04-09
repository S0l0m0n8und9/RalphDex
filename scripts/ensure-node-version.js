#!/usr/bin/env node

const minimumMajor = 20;
const current = process.versions.node;
const major = Number.parseInt(current.split('.')[0] ?? '0', 10);

if (Number.isNaN(major) || major < minimumMajor) {
  console.error(
    `Packaging requires Node ${minimumMajor}+; current runtime is ${current}. ` +
    'Use a modern Node release before running npm run package.'
  );
  process.exit(1);
}

console.log(`Node runtime ${current} satisfies the packaging requirement (>= ${minimumMajor}).`);
