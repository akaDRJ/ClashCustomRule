#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'src', 'substore');
const outputDir = path.join(rootDir, 'dist', 'substore');
const isCheckMode = process.argv.includes('--check');
const copyFiles = ['convert.js', 'rename.js'];
const generatedFiles = [
  {
    file: 'convert-akcdn-fallback.js',
    sourceFile: 'convert.js',
    build(source) {
      const original = [
        'const runtimeArgs =',
        "  typeof $arguments === 'object' && $arguments !== null ? $arguments : {};"
      ].join('\n');
      const replacement = [
        'const runtimeArgs = {',
        "  ...(typeof $arguments === 'object' && $arguments !== null ? $arguments : {}),",
        '  akcdnfallback: true,',
        '  landing: true',
        '};'
      ].join('\n');
      if (!source.includes(original)) {
        throw new Error('convert.js runtimeArgs block changed; update convert-akcdn-fallback.js generator.');
      }
      return source.replace(original, replacement);
    }
  }
];

const outputs = [
  ...copyFiles.map((file) => ({
    file,
    build() {
      return fs.readFileSync(path.join(sourceDir, file), 'utf8');
    }
  })),
  ...generatedFiles.map((definition) => ({
    file: definition.file,
    build() {
      const source = fs.readFileSync(path.join(sourceDir, definition.sourceFile), 'utf8');
      return definition.build(source);
    }
  }))
];

let hasDrift = false;

for (const output of outputs) {
  const outputPath = path.join(outputDir, output.file);
  const source = output.build();
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';

  if (isCheckMode) {
    if (current !== source) {
      hasDrift = true;
      console.log(`OUTDATED dist/substore/${output.file}`);
    } else {
      console.log(`OK dist/substore/${output.file}`);
    }
    continue;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, source);
  console.log(`WROTE dist/substore/${output.file}`);
}

if (isCheckMode) {
  if (hasDrift) {
    console.error('\nSub-Store scripts are out of date. Run: npm run build:substore');
    process.exit(1);
  }
  console.log('\nAll published Sub-Store scripts are up-to-date.');
}
