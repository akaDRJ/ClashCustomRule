#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const isCheckMode = process.argv.includes('--check');
const ruleSets = require(path.join(rootDir, 'rules', 'src', 'rulesets.js'));

const binary = resolveMihomoBinary();
if (!binary) {
  console.error('mihomo binary not found. Install mihomo or set MIHOMO_BIN.');
  process.exit(2);
}

const tempDir = fs.mkdtempSync(path.join(rootDir, '.tmp-mrs-'));
let hasOutdated = false;
let hasError = false;

try {
  for (const [yamlFile, payload] of Object.entries(ruleSets)) {
    if (!Array.isArray(payload) || payload.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new Error(`Invalid payload in ${yamlFile}: expected non-empty string array.`);
    }

    const yamlPath = path.join(rootDir, yamlFile);
    const mrsFile = toMrsFileName(yamlFile);
    const mrsPath = path.join(rootDir, mrsFile);
    const tempMrsPath = path.join(tempDir, mrsFile);

    const result = convertToMrs(binary, yamlPath, tempMrsPath);
    if (!result.ok) {
      hasError = true;
      console.error(`FAILED ${mrsFile}`);
      if (result.message) {
        console.error(result.message);
      }
      continue;
    }

    const nextBuffer = fs.readFileSync(tempMrsPath);
    const currentBuffer = fs.existsSync(mrsPath) ? fs.readFileSync(mrsPath) : null;
    const isSame = currentBuffer && Buffer.compare(currentBuffer, nextBuffer) === 0;

    if (isCheckMode) {
      if (isSame) {
        console.log(`OK ${mrsFile}`);
      } else {
        hasOutdated = true;
        console.log(`OUTDATED ${mrsFile}`);
      }
      continue;
    }

    if (isSame) {
      console.log(`SKIP ${mrsFile}`);
      continue;
    }

    fs.writeFileSync(mrsPath, nextBuffer);
    console.log(`WROTE ${mrsFile}`);
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

if (hasError) {
  process.exit(2);
}

if (isCheckMode) {
  if (hasOutdated) {
    console.error('\nMRS files are out of date. Run: npm run build:mrs');
    process.exit(1);
  }
  console.log('\nAll generated MRS files are up-to-date.');
}

function toMrsFileName(yamlFile) {
  if (!/\.yaml$/i.test(yamlFile)) {
    throw new Error(`Unsupported ruleset file extension: ${yamlFile}`);
  }
  return yamlFile.replace(/\.yaml$/i, '.mrs');
}

function resolveMihomoBinary() {
  const candidates = [
    process.env.MIHOMO_BIN,
    'mihomo',
    'clash-meta'
  ].filter(Boolean);

  for (const candidate of candidates) {
    const check = spawnSync(candidate, ['-v'], { encoding: 'utf8' });
    if (!check.error && check.status === 0) {
      return candidate;
    }
  }

  return null;
}

function convertToMrs(binaryPath, inputYamlPath, outputMrsPath) {
  const args = ['convert-ruleset', 'domain', 'yaml', inputYamlPath, outputMrsPath];
  const command = spawnSync(binaryPath, args, { encoding: 'utf8' });

  if (command.error) {
    return {
      ok: false,
      message: command.error.message
    };
  }

  if (command.status !== 0) {
    const stdout = command.stdout ? command.stdout.trim() : '';
    const stderr = command.stderr ? command.stderr.trim() : '';
    return {
      ok: false,
      message: [stdout, stderr].filter(Boolean).join('\n') || `Exit code ${command.status}`
    };
  }

  return { ok: true };
}
