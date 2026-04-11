const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function withTempDir(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clashcustomrule-test-'));
  try {
    return run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function loadRename(argumentsMap) {
  const modulePath = path.join(repoRoot, 'rename.js');
  delete require.cache[modulePath];
  global.$arguments = argumentsMap;
  return require(modulePath);
}

test('rename one removes the full custom separator when only one node remains', () => {
  const rename = loadRename({ flag: true, one: true, sn: ' - ' });
  const result = rename.operator([{ name: '香港 IPLC' }]);

  assert.deepEqual(result, [{ name: '🇭🇰 香港' }]);
});

test('lint-rules ignores duplicate proxy entries in config files but still reports duplicated rules', () => {
  withTempDir((tempDir) => {
    fs.writeFileSync(
      path.join(tempDir, 'config.yaml'),
      [
        'proxy-groups:',
        '  -',
        '    name: 节点选择',
        '    proxies:',
        '      - 香港节点',
        '      - 香港节点',
        ''
      ].join('\n')
    );

    fs.writeFileSync(
      path.join(tempDir, 'forcedirect.yaml'),
      ['payload:', '  - "+.example.com"', '  - "+.example.com"', ''].join('\n')
    );

    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, 'scripts', 'lint-rules.js')],
      {
        cwd: tempDir,
        encoding: 'utf8'
      }
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /DUPLICATE forcedirect\.yaml:/);
    assert.doesNotMatch(result.stdout, /DUPLICATE config\.yaml:/);
  });
});

test('sync-drjcustomrule-3 preserves regex filters when a group also defines fixed proxies', () => {
  withTempDir((tempDir) => {
    const scriptsDir = path.join(tempDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.copyFileSync(
      path.join(repoRoot, 'scripts', 'sync-drjcustomrule-3.js'),
      path.join(scriptsDir, 'sync-drjcustomrule-3.js')
    );

    fs.writeFileSync(
      path.join(tempDir, 'convert.js'),
      [
        'module.exports = {',
        '  main() {',
        '    return {',
        "      'proxy-groups': [",
        '        {',
        "          name: '前置代理',",
        "          type: 'select',",
        "          'include-all': true,",
        "          'exclude-filter': '(?i)家宽|落地',",
        "          proxies: ['自动选择', 'DIRECT']",
        '        }',
        '      ]',
        '    };',
        '  },',
        '  metadata: {',
        "    rules: ['rule-set,dummy,节点选择'],",
        '    ruleProviders: {',
        '      dummy: {',
        "        type: 'http',",
        "        behavior: 'domain',",
        "        url: 'https://example.com/dummy.mrs'",
        '      }',
        '    },',
        "    countryRegex: { 香港: '(?i)HK' }",
        '  }',
        '};',
        ''
      ].join('\n')
    );

    const result = spawnSync(
      process.execPath,
      [path.join(scriptsDir, 'sync-drjcustomrule-3.js')],
      {
        cwd: tempDir,
        encoding: 'utf8'
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const rendered = fs.readFileSync(path.join(tempDir, 'DRJCustomRule_3.0.ini'), 'utf8');
    const groupLine = rendered
      .split(/\r?\n/)
      .find((line) => line.startsWith('custom_proxy_group=前置代理`select`'));

    assert.ok(groupLine, rendered);
    assert.match(groupLine, /\[]自动选择/);
    assert.match(groupLine, /\[]DIRECT/);
    assert.match(groupLine, /\(\?i\)\^\(\?!\.\*\(\?:家宽\|落地\)\)\.\*\$/);
  });
});
