#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const ruleSets = require(path.join(rootDir, 'rules', 'src', 'rulesets.js'));
const isCheckMode = process.argv.includes('--check');

let hasOutdated = false;

function renderPayload(payload) {
  return `payload:\n${payload.map((value) => `- ${JSON.stringify(value)}`).join('\n')}\n`;
}

for (const [fileName, payload] of Object.entries(ruleSets)) {
  if (!Array.isArray(payload) || payload.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Invalid payload in ${fileName}: expected non-empty string array.`);
  }

  const filePath = path.join(rootDir, fileName);
  const rendered = renderPayload(payload);
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';

  if (isCheckMode) {
    if (current !== rendered) {
      hasOutdated = true;
      console.log(`OUTDATED ${fileName}`);
    } else {
      console.log(`OK ${fileName}`);
    }
    continue;
  }

  fs.writeFileSync(filePath, rendered);
  console.log(`WROTE ${fileName} (${payload.length} entries)`);
}

if (isCheckMode) {
  if (hasOutdated) {
    console.error('\nRule files are out of date. Run: npm run build:rules');
    process.exit(1);
  }
  console.log('\nAll generated rule files are up-to-date.');
}
