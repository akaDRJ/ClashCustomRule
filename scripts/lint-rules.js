#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const distRoots = [
  path.join(root, 'dist', 'configs'),
  path.join(root, 'dist', 'rulesets', 'yaml')
];
const targetFiles = resolveTargetFiles();

const strict = process.argv.includes('--strict');
let hasIssue = false;

function isRuleLikeFile(filePath) {
  return /\.(ya?ml|ini)$/i.test(filePath);
}

function listFilesRecursive(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
    } else if (entry.isFile() && isRuleLikeFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function resolveTargetFiles() {
  const distFiles = distRoots.flatMap(listFilesRecursive);
  if (distFiles.length > 0) {
    return distFiles.sort();
  }

  return listFilesRecursive(root).sort();
}

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
  const rel = path.relative(root, file) || file;
  const raw = fs.readFileSync(file, 'utf8');
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
      console.log(`DUPLICATE ${rel}:${i + 1} == ${seen.get(key)}`);
    } else {
      seen.set(key, i + 1);
    }
  }

  console.log(`OK ${rel} (effective-rules: ${effective})`);
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
