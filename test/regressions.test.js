const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');

const repoRoot = path.resolve(__dirname, '..');
const rootPublicFiles = [
  'convert.js',
  'rename.js',
  'convert-overseas-to-cn.js',
  'config.yaml',
  'config_substore.yaml',
  'DRJCustomRule_3.0.ini',
  'ai.yaml',
  'crypto.yaml',
  'forcedirect.yaml',
  'forceproxy.yaml',
  'mining.yaml',
  'outlook.yaml',
  'pt.yaml',
  'steamcontent.yaml',
  'ai.mrs',
  'crypto.mrs',
  'forcedirect.mrs',
  'forceproxy.mrs',
  'mining.mrs',
  'outlook.mrs',
  'pt.mrs',
  'steamcontent.mrs'
];

function withTempDir(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clashcustomrule-test-'));
  try {
    return run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function loadRename(argumentsMap) {
  const modulePath = path.join(repoRoot, 'src', 'substore', 'rename.js');
  delete require.cache[modulePath];
  global.$arguments = argumentsMap;
  return require(modulePath);
}

function loadConvert(argumentsMap) {
  const modulePath = path.join(repoRoot, 'src', 'substore', 'convert.js');
  delete require.cache[modulePath];
  global.$arguments = argumentsMap;
  return require(modulePath);
}

test('repository separates source, generated output, and legacy code', () => {
  for (const file of rootPublicFiles) {
    assert.equal(fs.existsSync(path.join(repoRoot, file)), false, `${file} should not live at repo root`);
  }

  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'substore', 'convert.js')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'substore', 'rename.js')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'data', 'rulesets.js')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'legacy', 'convert-overseas-to-cn.js')), true);

  assert.equal(fs.existsSync(path.join(repoRoot, 'dist', 'substore', 'convert.js')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'dist', 'substore', 'rename.js')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'dist', 'configs', 'config.yaml')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'dist', 'configs', 'config_substore.yaml')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'dist', 'configs', 'DRJCustomRule_3.0.ini')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'dist', 'rulesets', 'yaml', 'ai.yaml')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'dist', 'rulesets', 'mrs', 'ai.mrs')), true);
});

test('readme documents the current public dist layout', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

  assert.match(readme, /src\/\s+substore\//);
  assert.match(readme, /dist\/\s+substore\//);
  assert.match(readme, /dist\/configs\/config\.yaml/);
  assert.match(readme, /dist\/rulesets\/mrs\/<name>\.mrs/);
  assert.doesNotMatch(readme, /master\/convert\.js/);
  assert.doesNotMatch(readme, /master\/rename\.js/);
});

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
    const substoreDir = path.join(tempDir, 'src', 'substore');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(substoreDir, { recursive: true });
    fs.copyFileSync(
      path.join(repoRoot, 'scripts', 'sync-drjcustomrule-3.js'),
      path.join(scriptsDir, 'sync-drjcustomrule-3.js')
    );

    fs.writeFileSync(
      path.join(substoreDir, 'convert.js'),
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

    const rendered = fs.readFileSync(
      path.join(tempDir, 'dist', 'configs', 'DRJCustomRule_3.0.ini'),
      'utf8'
    );
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
  const convert = loadConvert({ full: true });
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
  assert.equal(result['find-process-mode'], undefined);
  assert.equal(result.dns['prefer-h3'], false);
  assert.equal(result.sniffer.sniff.TLS['override-destination'], false);
  assert.equal(result.sniffer.sniff.QUIC['override-destination'], false);
});

test('convert aggressive mode keeps the old high-risk performance defaults', () => {
  const convert = loadConvert({ full: true, aggressive: true });
  const result = convert.main({ proxies: [{ name: 'test', type: 'direct' }] });

  assert.equal(result['tcp-concurrent'], true);
  assert.equal(result['disable-keep-alive'], false);
  assert.equal(result.dns['prefer-h3'], true);
  assert.equal(result.sniffer.sniff.TLS['override-destination'], true);
  assert.equal(result.sniffer.sniff.QUIC['override-destination'], true);
});

test('convert main fails fast instead of returning a partial config', () => {
  const convert = loadConvert({});
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
  const { metadata } = loadConvert({});
  const providers = metadata.ruleProviders;

  for (const rule of metadata.rules) {
    const [kind, providerName] = rule.split(',');
    if (kind === 'rule-set') {
      assert.ok(providers[providerName], `missing provider for ${rule}`);
    }
  }

  assert.ok(Object.keys(metadata.countryRegex).length > 10);
});

test('convert DNS follows the akaDRJ strict fake-ip baseline', () => {
  const convert = loadConvert({});
  const result = convert.main({ proxies: [{ name: 'test', type: 'direct' }] });

  assert.deepEqual(result.dns, {
    enable: true,
    ipv6: false,
    'prefer-h3': false,
    'respect-rules': false,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'fake-ip-range6': '',
    'fake-ip-filter-mode': 'rule',
    'fake-ip-ttl': 1,
    'fake-ip-filter': ['MATCH,fake-ip'],
    'default-nameserver': ['223.5.5.5'],
    'proxy-server-nameserver': ['223.5.5.5'],
    'direct-nameserver': ['223.5.5.5'],
    'direct-nameserver-follow-policy': false,
    nameserver: [
      'https://8.8.8.8/dns-query#proxy&disable-ipv6=true&ecs=114.114.114.114/24&ecs-override=true'
    ],
    fallback: ['https://1.1.1.1/dns-query#proxy'],
    'fallback-filter': {
      geoip: true,
      'geoip-code': 'CN'
    }
  });
});

test('convert output avoids shared array aliases with direct yaml emitters', () => {
  const convert = loadConvert({ landing: true });
  const result = convert.main({
    proxies: [
      { name: '香港 01', type: 'direct' },
      { name: '日本 01', type: 'direct' },
      { name: '美国 01', type: 'direct' }
    ]
  });
  const rendered = YAML.stringify(result);

  assert.doesNotMatch(rendered, /&a\d+/);
  assert.doesNotMatch(rendered, /\*a\d+/);
});

test('convert keeps global country groups in detected country order', () => {
  const convert = loadConvert({});
  const result = convert.main({
    proxies: [
      { name: '香港 01', type: 'direct' },
      { name: '日本 01', type: 'direct' },
      { name: '美国 01', type: 'direct' }
    ]
  });
  const global = result['proxy-groups'].find((group) => group.name === 'GLOBAL');

  assert.deepEqual(
    global.proxies.filter((name) => name.endsWith('节点')),
    ['香港节点', '日本节点', '美国节点']
  );
});

test('convert omits empty landing group in enumerated mode', () => {
  const convert = loadConvert({ landing: true });
  const result = convert.main({
    proxies: [
      { name: '香港 01', type: 'direct' }
    ]
  });

  assert.equal(
    result['proxy-groups'].some(
      (group) => group.name === '落地节点' && Array.isArray(group.proxies) && group.proxies.length === 0
    ),
    false
  );
});

test('convert smart mode switches automatic url-test groups to smart', () => {
  const convert = loadConvert({ smart: true });
  const result = convert.main({
    proxies: [
      { name: '香港 01', type: 'direct' },
      { name: '日本 01', type: 'direct' },
      { name: '香港 0.5x', type: 'direct' }
    ]
  });
  const groups = Object.fromEntries(
    result['proxy-groups'].map((group) => [group.name, group])
  );

  assert.equal(groups['自动选择'].type, 'smart');
  assert.equal(groups['香港节点'].type, 'smart');
  assert.equal(groups['日本节点'].type, 'smart');
  assert.equal(groups['低倍率节点'].type, 'smart');
});

test('convert loadbalance keeps priority over smart for country and low cost groups', () => {
  const convert = loadConvert({ smart: true, loadbalance: true });
  const result = convert.main({
    proxies: [
      { name: '香港 01', type: 'direct' },
      { name: '香港 0.5x', type: 'direct' }
    ]
  });
  const groups = Object.fromEntries(
    result['proxy-groups'].map((group) => [group.name, group])
  );

  assert.equal(groups['自动选择'].type, 'smart');
  assert.equal(groups['香港节点'].type, 'load-balance');
  assert.equal(groups['低倍率节点'].type, 'load-balance');
});

test('package exposes one-shot test and check scripts', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

  assert.equal(manifest.scripts.test, 'node --test');
  assert.ok(manifest.scripts.check);
  assert.match(manifest.scripts.check, /npm run test/);
  assert.match(manifest.scripts.check, /npm run check:substore/);
  assert.match(manifest.scripts.check, /npm run check:configs/);
  assert.match(manifest.scripts.check, /npm run check:drj3/);
  assert.match(manifest.scripts.check, /npm run lint:rules -- --strict/);
  assert.match(manifest.scripts.check, /npm run check:rename-dict/);
  assert.equal(manifest.scripts['build:substore'], 'node scripts/build-substore.js');
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
    const raw = fs.readFileSync(path.join(repoRoot, 'dist', 'configs', file), 'utf8');

    assert.doesNotMatch(raw, /&a\d+/);
    assert.doesNotMatch(raw, /\*a\d+/);
  }
});

test('generated geox urls stay compact on one yaml line', () => {
  const keys = ['geoip', 'geosite', 'mmdb', 'asn'];

  for (const file of ['config.yaml', 'config_substore.yaml']) {
    const raw = fs.readFileSync(path.join(repoRoot, 'dist', 'configs', file), 'utf8');
    const parsed = YAML.parse(raw);
    const geoxBlock = raw.match(/^geox-url:\n(?<body>(?:  .+\n)+)/m);

    assert.ok(geoxBlock, `${file} missing geox-url block`);
    for (const key of keys) {
      assert.match(
        geoxBlock.groups.body,
        new RegExp(`^  ${key}: ['"]?https://[^'"\\n]+['"]?$`, 'm'),
        `${file} ${key} should be a single line`
      );
      assert.equal(parsed['geox-url'][key].length <= 80, true, `${file} ${key} is too long`);
    }
    assert.equal(
      parsed['geox-url'].geosite.length <= 76,
      true,
      `${file} geosite exceeds Sub-Store scalar fold threshold`
    );
    assert.doesNotMatch(geoxBlock.groups.body, />-/);
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
