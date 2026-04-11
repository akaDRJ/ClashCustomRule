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

function readYamlSection(rawLine, currentSection) {
  if (!rawLine.trim()) return currentSection;
  if (/^\S/.test(rawLine)) {
    const match = rawLine.match(/^([^:#]+):/);
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : currentSection;
  }
  return currentSection;
}

function isTrackedRuleLine(file, rawLine, currentYamlSection) {
  const trimmed = rawLine.trim();
  const ext = path.extname(file).toLowerCase();

  if (!trimmed || trimmed.startsWith('#')) return false;

  if (ext === '.ini') {
    return trimmed.startsWith('ruleset=');
  }

  if (ext === '.yaml' || ext === '.yml') {
    if (!trimmed.startsWith('- ')) return false;
    return currentYamlSection === 'payload' || currentYamlSection === 'rules';
  }

  return false;
}

for (const file of targetFiles) {
  const abs = path.join(root, file);
  const raw = fs.readFileSync(abs, 'utf8');
  const lines = raw.split(/\r?\n/);

  const seen = new Map();
  let effective = 0;
  let currentYamlSection = '';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    currentYamlSection = readYamlSection(rawLine, currentYamlSection);
    if (!line || line.startsWith('#')) continue;

    if (!isTrackedRuleLine(file, rawLine, currentYamlSection)) continue;

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
