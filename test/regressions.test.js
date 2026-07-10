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
  'convert-akcdn-fallback.js',
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
  delete require.cache[require.resolve(modulePath)];
  global.$arguments = argumentsMap;
  return require(modulePath);
}

function loadConvert(argumentsMap) {
  const modulePath = path.join(repoRoot, 'src', 'substore', 'convert.js');
  delete require.cache[require.resolve(modulePath)];
  global.$arguments = argumentsMap;
  return require(modulePath);
}

function loadSingBoxConvert(argumentsMap) {
  const modulePath = path.join(repoRoot, 'src', 'substore', 'convert-sing-box.js');
  delete require.cache[require.resolve(modulePath)];
  global.$arguments = argumentsMap;
  return require(modulePath);
}

function loadAkcdnFallbackConvert(argumentsMap) {
  return loadConvert({ ...argumentsMap, akcdnfallback: true, landing: true });
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
  assert.equal(fs.existsSync(path.join(repoRoot, 'dist', 'substore', 'convert-akcdn-fallback.js')), false);
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
  assert.doesNotMatch(readme, /convert-akcdn-fallback\.js/);
  assert.match(readme, /dist\/rulesets\/mrs\/<name>\.mrs/);
  assert.doesNotMatch(readme, /master\/convert\.js/);
  assert.doesNotMatch(readme, /master\/rename\.js/);
});

test('rename one removes the full custom separator when only one node remains', () => {
  const rename = loadRename({ flag: true, one: true, sn: ' - ' });
  const result = rename.operator([{ name: '香港 IPLC' }]);

  assert.deepEqual(result, [{ name: '🇭🇰 香港' }]);
});

test('rename decodes percent-encoded argument values', () => {
  const rename = loadRename({ name: 'NX%26Co' });
  const result = rename.operator([{ name: '香港 IPLC' }]);

  assert.equal(result[0].name, 'NX&Co 香港 01');
});

test('rename preserves existing block-quic when argument is omitted', () => {
  const rename = loadRename({});
  const result = rename.operator([{ name: '香港 IPLC', 'block-quic': 'on' }]);

  assert.equal(result.length, 1);
  assert.equal(result[0]['block-quic'], 'on');
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

test('convert routes Google FCM directly before generic Google rules', () => {
  const { metadata } = loadConvert({});
  const googleFcmRule = 'geosite,googlefcm,全球直连';

  assert.equal(metadata.rules.includes(googleFcmRule), true);
  assert.equal(
    metadata.rules.indexOf(googleFcmRule) < metadata.rules.indexOf('geosite,google,Google'),
    true
  );
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

test('sing-box convert builds modular Sub-Store config with selectors, rule sets, and DNS', () => {
  const convert = loadSingBoxConvert({});
  const result = convert.build({
    proxies: [
      {
        name: '香港 01',
        type: 'ss',
        server: 'hk.example.com',
        port: 443,
        cipher: '2022-blake3-aes-128-gcm',
        password: 'redacted'
      },
      {
        name: '日本 01',
        type: 'trojan',
        server: 'jp.example.com',
        port: 443,
        password: 'redacted'
      },
      {
        name: '台湾 01',
        type: 'anytls',
        server: 'tw.example.com',
        port: 8443,
        password: 'redacted',
        sni: 'example.com',
        'skip-cert-verify': true
      }
    ]
  });
  const outbounds = Object.fromEntries(result.outbounds.map((outbound) => [outbound.tag, outbound]));
  const ruleSets = Object.fromEntries(result.route.rule_set.map((ruleSet) => [ruleSet.tag, ruleSet]));

  assert.equal(result.log.level, 'info');
  assert.equal(result.dns.strategy, 'ipv4_only');
  assert.equal(result.dns.final, 'remote');
  assert.equal(result.dns.timeout, '5s');
  assert.ok(result.dns.servers.some((server) => server.tag === 'bootstrap' && server.type === 'udp'));
  assert.deepEqual(result.dns.rules, [{ rule_set: ['geosite-private', 'geosite-cn'], server: 'local' }]);
  assert.deepEqual(result.dns.servers.find((server) => server.tag === 'remote'), { type: 'tls', tag: 'remote', server: '8.8.8.8', detour: '节点选择' });
  assert.equal(result.dns.servers.filter((server) => server.type === 'https').every((server) => server.domain_resolver === 'bootstrap'), true);
  assert.ok(result.inbounds.some((inbound) => inbound.type === 'mixed'));
  assert.ok(result.inbounds.some((inbound) => inbound.type === 'tun' && inbound.auto_route === true && inbound.strict_route === true));
  assert.equal(result.experimental.clash_api.external_controller, '127.0.0.1:9090');
  assert.equal(result.experimental.clash_api.access_control_allow_private_network, true);
  assert.ok(result.experimental.clash_api.access_control_allow_origin.includes('http://yacd.haishan.me'));
  assert.equal(outbounds['节点选择'].type, 'selector');
  assert.deepEqual(outbounds['节点选择'].outbounds, ['自动选择', '手动切换', '香港节点', '台湾节点', '日本节点', 'direct']);
  assert.deepEqual(outbounds['YouTube'].outbounds, ['节点选择', '香港节点', '台湾节点', '日本节点', '自动选择', '手动切换', 'direct']);
  assert.deepEqual(outbounds['人工智能'].outbounds, ['节点选择', '香港节点', '台湾节点', '日本节点', '自动选择', '手动切换', 'direct']);
  assert.equal(outbounds['自动选择'].type, 'urltest');
  assert.deepEqual(outbounds['自动选择'].outbounds, ['香港 01', '日本 01', '台湾 01']);
  assert.equal(outbounds['手动切换'].type, 'selector');
  assert.deepEqual(outbounds['手动切换'].outbounds, ['香港 01', '日本 01', '台湾 01']);
  assert.deepEqual(outbounds['香港节点'].outbounds, ['香港 01']);
  assert.deepEqual(outbounds['台湾节点'].outbounds, ['台湾 01']);
  assert.deepEqual(outbounds['日本节点'].outbounds, ['日本 01']);
  assert.deepEqual(outbounds['全球直连'].outbounds, ['direct']);
  assert.deepEqual(outbounds['强制代理'].outbounds, ['节点选择', '香港节点', '台湾节点', '日本节点', '自动选择', '手动切换', 'direct']);
  assert.equal(outbounds['香港 01'].type, 'shadowsocks');
  assert.equal(outbounds['日本 01'].type, 'trojan');
  assert.deepEqual(outbounds['台湾 01'], {
    type: 'anytls',
    tag: '台湾 01',
    server: 'tw.example.com',
    server_port: 8443,
    password: 'redacted',
    tls: { enabled: true, server_name: 'example.com', insecure: true }
  });
  assert.equal(ruleSets.ai.type, 'remote');
  assert.match(ruleSets.ai.url, /^https:\/\/cdn\.jsdelivr\.net\/gh\/akaDRJ\/ClashCustomRule@master\/dist\/rulesets\/sing-box\/ai\.json$/);
  assert.equal(Object.prototype.hasOwnProperty.call(ruleSets.ai, 'download_detour'), false);
  assert.equal(ruleSets['geosite-youtube'].format, 'binary');
  assert.match(ruleSets['geosite-youtube'].url, /^https:\/\/cdn\.jsdelivr\.net\/gh\/SagerNet\/sing-geosite@rule-set\/geosite-youtube\.srs$/);
  assert.equal(ruleSets['geoip-cn'].format, 'binary');
  assert.match(ruleSets['geoip-cn'].url, /^https:\/\/cdn\.jsdelivr\.net\/gh\/SagerNet\/sing-geoip@rule-set\/geoip-cn\.srs$/);
  assert.equal(JSON.stringify(result.route.rules).includes('"geosite"'), false);
  assert.equal(JSON.stringify(result.route.rules).includes('"geoip"'), false);
  assert.deepEqual(result.route.rules.slice(0, 6), [
    { action: 'sniff' },
    { type: 'logical', mode: 'or', rules: [{ protocol: 'dns' }, { port: 53 }], action: 'hijack-dns' },
    { type: 'logical', mode: 'or', rules: [{ network: 'udp', port: 443 }, { port: 853 }], action: 'reject' },
    { rule_set: 'forcedirect', outbound: '全球直连' },
    { rule_set: 'forceproxy', outbound: '强制代理' },
    { rule_set: 'ai', outbound: '人工智能' }
  ]);
  assert.equal(result.route.default_domain_resolver, 'bootstrap');
  assert.deepEqual(result.http_clients, [{ tag: 'rule-set-download' }]);
  assert.equal(result.route.default_http_client, 'rule-set-download');
  assert.equal(result.route.final, '节点选择');
  assert.equal(JSON.parse(convert.operator(result.outbounds.slice(-2))).route.final, '节点选择');
  assert.equal(JSON.parse(convert.operator({ proxies: result.outbounds.slice(-2) })).route.final, '节点选择');
  assert.equal(JSON.parse(convert.main({ proxies: result.outbounds.slice(-2) })).route.final, '节点选择');
});

test('sing-box generated selector policies have no circular outbound dependencies', () => {
  const { buildSingBoxConfig } = require(path.join(repoRoot, 'src', 'sing-box', 'config.js'));
  const result = buildSingBoxConfig({
    proxies: [
      { name: '香港 01', type: 'anytls', server: 'hk.example.com', port: 443, password: 'redacted' },
      { name: '美国 01', type: 'anytls', server: 'us.example.com', port: 443, password: 'redacted' }
    ]
  });
  const outboundMap = Object.fromEntries(result.outbounds.map((outbound) => [outbound.tag, outbound]));
  const visit = (tag, stack = []) => {
    assert.equal(stack.includes(tag), false, `circular outbound dependency: ${[...stack, tag].join('->')}`);
    const outbound = outboundMap[tag];
    if (!outbound || !Array.isArray(outbound.outbounds)) return;
    for (const child of outbound.outbounds) visit(child, [...stack, tag]);
  };

  for (const outbound of result.outbounds) visit(outbound.tag);
});

test('sing-box Momo target needs no manual compatibility rewrite', () => {
  const convert = loadSingBoxConvert({ momo: true, mixedPort: '7899' });
  const result = convert.build({ proxies: [] });
  const tun = result.inbounds.find((inbound) => inbound.type === 'tun');
  const mixed = result.inbounds.find((inbound) => inbound.type === 'mixed');

  assert.equal(Object.prototype.hasOwnProperty.call(result.dns, 'timeout'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'http_clients'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.route, 'default_http_client'), false);
  assert.equal(tun.tag, 'tun-in');
  assert.equal(tun.interface_name, 'momo-tun');
  assert.equal(tun.auto_route, false);
  assert.equal(mixed.listen_port, 7899);
});

test('sing-box generated config avoids removed geosite and geoip route fields', () => {
  const { buildSingBoxConfig } = require(path.join(repoRoot, 'src', 'sing-box', 'config.js'));
  const result = buildSingBoxConfig({ proxies: [] });
  const rulesJson = JSON.stringify(result.route.rules);

  assert.equal(rulesJson.includes('"geosite"'), false);
  assert.equal(rulesJson.includes('"geoip"'), false);
  assert.ok(result.route.rules.some((rule) => rule.rule_set === 'geosite-youtube' && rule.outbound === 'YouTube'));
  assert.ok(result.route.rules.some((rule) => rule.rule_set === 'geoip-cn' && rule.outbound === '全球直连'));
  assert.equal(result.route.rule_set.some((ruleSet) => ['geoip-netflix', 'geoip-google', 'geoip-telegram'].includes(ruleSet.tag)), false);
  assert.equal(result.route.rule_set.some((ruleSet) => ruleSet.url.includes('raw.githubusercontent.com')), false);
  assert.ok(result.route.rules.some((rule) => rule.ip_is_private === true && rule.outbound === '全球直连'));
});

test('sing-box generated config uses static groups instead of Clash-only filters', () => {
  const { buildSingBoxConfig } = require(path.join(repoRoot, 'src', 'sing-box', 'config.js'));
  const result = buildSingBoxConfig({
    proxies: [
      { name: '香港 01', type: 'anytls', server: 'hk.example.com', port: 443, password: 'redacted' },
      { name: '美国 0.5x', type: 'anytls', server: 'us.example.com', port: 443, password: 'redacted' },
      { name: '落地 台湾 01', type: 'anytls', server: 'tw.example.com', port: 443, password: 'redacted' }
    ]
  });
  const outbounds = Object.fromEntries(result.outbounds.map((outbound) => [outbound.tag, outbound]));
  const outboundJson = JSON.stringify(result.outbounds);

  assert.equal(outboundJson.includes('include-all'), false);
  assert.equal(outboundJson.includes('filter'), false);
  assert.equal(outboundJson.includes('fallback'), false);
  assert.equal(outboundJson.includes('load-balance'), false);
  assert.equal(outboundJson.includes('smart'), false);
  assert.deepEqual(outbounds['香港节点'].outbounds, ['香港 01']);
  assert.deepEqual(outbounds['美国节点'].outbounds, ['美国 0.5x']);
  assert.deepEqual(outbounds['低倍率节点'].outbounds, ['美国 0.5x']);
  assert.deepEqual(outbounds['台湾节点'].outbounds, ['落地 台湾 01']);
  assert.equal(outbounds['落地节点'], undefined);
});

test('sing-box builder keeps already produced sing-box outbound tags', () => {
  const { buildSingBoxConfig } = require(path.join(repoRoot, 'src', 'sing-box', 'config.js'));
  const result = buildSingBoxConfig({
    proxies: [
      { tag: '🇭🇰 NX 香港 01', type: 'anytls', server: 'hk.example.com', server_port: 443, password: 'redacted' }
    ]
  });
  const outbounds = Object.fromEntries(result.outbounds.map((outbound) => [outbound.tag, outbound]));

  assert.equal(outbounds['🇭🇰 NX 香港 01'].server_port, 443);
  assert.deepEqual(outbounds['香港节点'].outbounds, ['🇭🇰 NX 香港 01']);
});

test('sing-box builder strips legacy detours instead of generating pre-proxy fallback', () => {
  const { buildSingBoxConfig } = require(path.join(repoRoot, 'src', 'sing-box', 'config.js'));
  const result = buildSingBoxConfig({
    proxies: [
      { tag: '🇭🇰 NX 香港 01', type: 'anytls', server: 'hk.example.com', server_port: 443, password: 'redacted' },
      { tag: '🇹🇼 落地 台湾 01', type: 'vmess', server: 'tw.example.com', server_port: 443, uuid: 'redacted', detour: '前置代理' }
    ]
  });
  const outbounds = Object.fromEntries(result.outbounds.map((outbound) => [outbound.tag, outbound]));
  const tags = new Set(result.outbounds.map((outbound) => outbound.tag));

  assert.equal(outbounds['🇹🇼 落地 台湾 01'].detour, undefined);
  assert.equal(outbounds['前置代理'], undefined);
  assert.deepEqual(outbounds['台湾节点'].outbounds, ['🇹🇼 落地 台湾 01']);
  assert.deepEqual(outbounds['节点选择'].outbounds, ['自动选择', '手动切换', '香港节点', '台湾节点', 'direct']);
  for (const outbound of result.outbounds) {
    for (const child of outbound.outbounds || []) assert.equal(tags.has(child), true, `missing child outbound ${child}`);
    assert.equal(outbound.detour, undefined);
  }
});

test('sing-box remote rule-set tags all have generated source files', () => {
  const { RULE_SET_TAGS } = require(path.join(repoRoot, 'src', 'sing-box', 'config.js'));
  const generatedTags = new Set(
    fs.readdirSync(path.join(repoRoot, 'dist', 'rulesets', 'sing-box'))
      .map((file) => file.replace(/\.json$/, ''))
  );

  assert.deepEqual(
    RULE_SET_TAGS.filter((tag) => !tag.startsWith('geosite-') && !tag.startsWith('geoip-') && !generatedTags.has(tag)),
    []
  );
});

test('build-substore publishes a self-contained sing-box Sub-Store converter', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'build-substore.js'), 'utf8');

  assert.match(source, /convert-sing-box\.js/);

  const output = fs.readFileSync(path.join(repoRoot, 'dist', 'substore', 'convert-sing-box.js'), 'utf8');
  assert.doesNotMatch(output, /require\(['"]\.\.\/sing-box\//);
  assert.match(output, /function buildSingBoxConfig/);
});

test('package check includes sing-box build drift checks', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

  assert.equal(manifest.scripts['build:sing-box'], 'node scripts/build-sing-box.js');
  assert.equal(manifest.scripts['check:sing-box'], 'node scripts/build-sing-box.js --check');
  assert.match(manifest.scripts.check, /npm run check:sing-box/);
});

test('akcdn fallback convert prefers IX and lets pre-proxy choose transit groups instead of raw nodes', () => {
  const convert = loadAkcdnFallbackConvert({});
  const result = convert.main({
    proxies: [
      {
        name: '🇭🇰 NX 香港 01',
        type: 'ss',
        server: 'nexitally.example',
        port: 46030
      },
      {
        name: '🇭🇰 YT 香港 01',
        type: 'anytls',
        server: 'ytoo.example',
        port: 14521
      },
      {
        name: '🇨🇳 台湾 01',
        type: 'anytls',
        server: '162.14.111.30',
        port: 443
      },
      {
        name: '🇨🇳 台湾 02',
        type: 'ss',
        server: '163.223.125.8',
        port: 25578
      },
      {
        name: '🇹🇼 落地 台湾 01',
        type: 'vmess',
        server: '83.147.12.131',
        port: 443,
        'dialer-proxy': '前置代理'
      }
    ]
  });
  const groups = Object.fromEntries(result['proxy-groups'].map((group) => [group.name, group]));

  assert.equal(groups['AKCDN 兜底'].type, 'fallback');
  assert.deepEqual(groups['AKCDN 兜底'].proxies, ['🇨🇳 台湾 01', '🇨🇳 台湾 02', '🇹🇼 落地 台湾 01']);
  assert.equal(groups['AKCDN 兜底'].lazy, false);
  assert.equal(groups['节点选择'].proxies[0], 'AKCDN 兜底');
  assert.equal(groups['GLOBAL'].proxies.includes('AKCDN 兜底'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(groups['自动选择'], 'proxies'), false);
  assert.equal(groups['前置代理'].type, 'select');
  assert.deepEqual(groups['前置代理'].proxies, [
    '中转自动选择',
    '中转香港节点',
    '中转手动切换'
  ]);
  assert.equal(groups['中转自动选择'].type, 'url-test');
  assert.deepEqual(groups['中转自动选择'].proxies, ['🇭🇰 NX 香港 01', '🇭🇰 YT 香港 01']);
  assert.equal(groups['中转香港节点'].type, 'url-test');
  assert.deepEqual(groups['中转香港节点'].proxies, ['🇭🇰 NX 香港 01', '🇭🇰 YT 香港 01']);
  assert.equal(groups['中转手动切换'].type, 'select');
  assert.deepEqual(groups['中转手动切换'].proxies, ['🇭🇰 NX 香港 01', '🇭🇰 YT 香港 01']);
});

test('akcdn fallback convert omits fallback when no independent transit node exists', () => {
  const convert = loadAkcdnFallbackConvert({});
  const result = convert.main({
    proxies: [
      {
        name: '🇨🇳 台湾 01',
        type: 'anytls',
        server: '162.14.111.30',
        port: 443
      },
      {
        name: '🇹🇼 落地 台湾 01',
        type: 'vmess',
        server: '83.147.12.131',
        port: 443,
        'dialer-proxy': '前置代理'
      }
    ]
  });

  assert.equal(
    result['proxy-groups'].some((group) => group.name === 'AKCDN 兜底'),
    false
  );
});

test('akcdn fallback convert keeps base behavior when no AKCDN and dialer pair exists', () => {
  const convert = loadAkcdnFallbackConvert({ landing: true });
  const result = convert.main({
    proxies: [
      { name: '香港 01', type: 'direct' },
      { name: '🇹🇼 落地 台湾 01', type: 'vmess', 'dialer-proxy': '前置代理' }
    ]
  });

  assert.equal(
    result['proxy-groups'].some((group) => group.name === 'AKCDN 兜底'),
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
