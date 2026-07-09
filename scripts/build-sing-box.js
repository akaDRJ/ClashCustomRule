#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const ruleSets = require(path.join(rootDir, 'src', 'data', 'rulesets.js'));
const { buildSourceRuleSet, ruleSetTagFromFile } = require(path.join(rootDir, 'src', 'sing-box', 'rule-sets.js'));

const outputDir = path.join(rootDir, 'dist', 'rulesets', 'sing-box');
const isCheckMode = process.argv.includes('--check');
let hasDrift = false;

function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

for (const [fileName, payload] of Object.entries(ruleSets)) {
  if (!Array.isArray(payload) || payload.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Invalid payload in ${fileName}: expected non-empty string array.`);
  }

  const tag = ruleSetTagFromFile(fileName);
  const outputPath = path.join(outputDir, `${tag}.json`);
  const rendered = renderJson(buildSourceRuleSet(payload));
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';

  if (isCheckMode) {
    if (current !== rendered) {
      hasDrift = true;
      console.log(`OUTDATED dist/rulesets/sing-box/${tag}.json`);
    } else {
      console.log(`OK dist/rulesets/sing-box/${tag}.json`);
    }
    continue;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, rendered);
  console.log(`WROTE dist/rulesets/sing-box/${tag}.json (${payload.length} entries)`);
}

if (isCheckMode) {
  if (hasDrift) {
    console.error('\nsing-box rule-set files are out of date. Run: npm run build:sing-box');
    process.exit(1);
  }
  console.log('\nAll generated sing-box rule-set files are up-to-date.');
}
