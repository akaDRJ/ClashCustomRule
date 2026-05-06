#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sourcePath = path.join(rootDir, 'src', 'data', 'rulesets.js');
const outputDir = path.join(rootDir, 'dist', 'rulesets', 'yaml');
const ruleSets = require(sourcePath);
const isCheckMode = process.argv.includes('--check');

let hasOutdated = false;

function renderPayload(payload) {
  return `payload:\n${payload.map((value) => `- ${JSON.stringify(value)}`).join('\n')}\n`;
}

for (const [fileName, payload] of Object.entries(ruleSets)) {
  if (!Array.isArray(payload) || payload.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Invalid payload in ${fileName}: expected non-empty string array.`);
  }

  const filePath = path.join(outputDir, fileName);
  const rendered = renderPayload(payload);
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';

  if (isCheckMode) {
    if (current !== rendered) {
      hasOutdated = true;
      console.log(`OUTDATED dist/rulesets/yaml/${fileName}`);
    } else {
      console.log(`OK dist/rulesets/yaml/${fileName}`);
    }
    continue;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filePath, rendered);
  console.log(`WROTE dist/rulesets/yaml/${fileName} (${payload.length} entries)`);
}

if (isCheckMode) {
  if (hasOutdated) {
    console.error('\nRule files are out of date. Run: npm run build:rules');
    process.exit(1);
  }
  console.log('\nAll generated rule files are up-to-date.');
}
