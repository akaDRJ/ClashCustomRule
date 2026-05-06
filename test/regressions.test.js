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

test('convert full config uses conservative OpenWRT transparent proxy defaults', () => {
  const modulePath = path.join(repoRoot, 'convert.js');
  delete require.cache[modulePath];
  global.$arguments = { full: true };

  const convert = require(modulePath);
  const result = convert.main({
    proxies: [
      {
        name: 'AKCDN-IX-SS2022-twlite',
        type: 'ss',
        server: '39.108.228.6',
        port: 44031,
        cipher: '2022-blake3-aes-128-gcm',
        password: 'redacted'
      }
    ]
  });

  assert.equal(result['tcp-concurrent'], false);
  assert.equal(result['disable-keep-alive'], false);
  assert.equal(result.dns['prefer-h3'], false);
  assert.equal(result.sniffer.sniff.TLS['override-destination'], false);
  assert.equal(result.sniffer.sniff.QUIC['override-destination'], false);
});

test('convert aggressive mode keeps the old high-risk performance defaults', () => {
  const modulePath = path.join(repoRoot, 'convert.js');
  delete require.cache[modulePath];
  global.$arguments = { full: true, aggressive: true };

  const convert = require(modulePath);
  const result = convert.main({ proxies: [{ name: 'test', type: 'direct' }] });

  assert.equal(result['tcp-concurrent'], true);
  assert.equal(result['disable-keep-alive'], false);
  assert.equal(result.dns['prefer-h3'], true);
  assert.equal(result.sniffer.sniff.TLS['override-destination'], true);
  assert.equal(result.sniffer.sniff.QUIC['override-destination'], true);
});

test('convert main fails fast instead of returning a partial config', () => {
  const modulePath = path.join(repoRoot, 'convert.js');
  delete require.cache[modulePath];
  global.$arguments = {};

  const convert = require(modulePath);
  const config = { proxies: [{ name: '香港 01', type: 'direct' }] };
  Object.defineProperty(config, 'proxy-groups', {
    configurable: true,
    set() {
      throw new Error('write blocked');
    }
  });

  assert.throws(() => convert.main(config), /write blocked/);
});

test('convert metadata passes internal consistency checks', () => {
  const modulePath = path.join(repoRoot, 'convert.js');
  delete require.cache[modulePath];
  global.$arguments = {};

  const { metadata } = require(modulePath);
  const providers = metadata.ruleProviders;

  for (const rule of metadata.rules) {
    const [kind, providerName] = rule.split(',');
    if (kind === 'rule-set') {
      assert.ok(providers[providerName], `missing provider for ${rule}`);
    }
  }

  assert.ok(Object.keys(metadata.countryRegex).length > 10);
});

test('package exposes one-shot test and check scripts', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

  assert.equal(manifest.scripts.test, 'node --test');
  assert.ok(manifest.scripts.check);
  assert.match(manifest.scripts.check, /npm run test/);
  assert.match(manifest.scripts.check, /npm run check:configs/);
  assert.match(manifest.scripts.check, /npm run check:drj3/);
  assert.match(manifest.scripts.check, /npm run lint:rules -- --strict/);
  assert.match(manifest.scripts.check, /npm run check:rename-dict/);
});

test('rename country dictionary exposes complete row data without index drift', () => {
  const rename = loadRename({});
  const rows = rename._internal.COUNTRY_ROWS;

  assert.ok(Array.isArray(rows));
  assert.ok(rows.length > 150);

  const codes = new Set();
  for (const row of rows) {
    assert.match(row.code, /^[A-Z]{2,3}$/);
    assert.ok(row.zh);
    assert.ok(row.flag);
    assert.ok(row.quan);
    assert.equal(codes.has(row.code), false, `duplicate country code: ${row.code}`);
    codes.add(row.code);
  }
});

test('build-configs uses the yaml package instead of a hand-rolled emitter', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'build-configs.js'), 'utf8');

  assert.match(source, /require\(['"]yaml['"]\)/);
  assert.match(source, /aliasDuplicateObjects:\s*false/);
  assert.doesNotMatch(source, /function toYaml\(/);
  assert.doesNotMatch(source, /function formatScalar\(/);
});

test('generated configs avoid yaml anchors and aliases for client compatibility', () => {
  for (const file of ['config.yaml', 'config_substore.yaml']) {
    const raw = fs.readFileSync(path.join(repoRoot, file), 'utf8');

    assert.doesNotMatch(raw, /&a\d+/);
    assert.doesNotMatch(raw, /\*a\d+/);
  }
});

test('github actions runs the repository check command', () => {
  const workflowPath = path.join(repoRoot, '.github', 'workflows', 'check.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /mihomo -v/);
});
