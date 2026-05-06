#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'src', 'substore');
const outputDir = path.join(rootDir, 'dist', 'substore');
const isCheckMode = process.argv.includes('--check');
const files = ['convert.js', 'rename.js'];

let hasDrift = false;

for (const file of files) {
  const sourcePath = path.join(sourceDir, file);
  const outputPath = path.join(outputDir, file);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';

  if (isCheckMode) {
    if (current !== source) {
      hasDrift = true;
      console.log(`OUTDATED dist/substore/${file}`);
    } else {
      console.log(`OK dist/substore/${file}`);
    }
    continue;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, source);
  console.log(`WROTE dist/substore/${file}`);
}

if (isCheckMode) {
  if (hasDrift) {
    console.error('\nSub-Store scripts are out of date. Run: npm run build:substore');
    process.exit(1);
  }
  console.log('\nAll published Sub-Store scripts are up-to-date.');
}
