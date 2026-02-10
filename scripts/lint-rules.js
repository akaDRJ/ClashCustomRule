#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targetFiles = fs.readdirSync(root)
  .filter((f) => /\.(ya?ml|ini)$/i.test(f))
  .sort();

const strict = process.argv.includes('--strict');
let hasIssue = false;

function normalizeRule(line) {
  return line
    .replace(/\s+/g, '')
    .replace(/#.*/, '')
    .trim()
    .toLowerCase();
}

for (const file of targetFiles) {
  const abs = path.join(root, file);
  const raw = fs.readFileSync(abs, 'utf8');
  const lines = raw.split(/\r?\n/);

  const seen = new Map();
  let effective = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    // 仅对明显规则行做重复检测，避免误判普通 YAML 字段
    if (line.includes(',') || line.startsWith('- ')) {
      const key = normalizeRule(line);
      if (!key) continue;
      effective++;
      if (seen.has(key)) {
        hasIssue = true;
        console.log(`DUPLICATE ${file}:${i + 1} == ${seen.get(key)}`);
      } else {
        seen.set(key, i + 1);
      }
    }
  }

  console.log(`OK ${file} (effective-rules: ${effective})`);
}

if (!targetFiles.length) {
  console.log('No yaml/ini files found.');
}

if (hasIssue) {
  if (strict) {
    console.error('\nLint failed (strict): duplicate rules detected.');
    process.exit(1);
  }
  console.warn('\nLint warning: duplicate rules detected (non-strict mode).');
}

console.log('\nLint passed.');
