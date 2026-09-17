const test = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('../src/substore/convert');
const { buildRouteConfig, buildDnsConfig } = require('../src/sing-box/config');

// Frozen category memberships for regression cases; no live upstream dependency.
const cases = [
  ['api.githubcopilot.com', ['geosite:category-dev', 'geosite:category-ai-chat-!cn'], '人工智能'],
  ['api.jetbrains.ai', ['geosite:category-dev', 'geosite:category-ai-chat-!cn'], '人工智能'],
  ['play.google.com', ['geosite:google-play', 'geosite:google', 'geosite:cn'], 'Google'],
  ['www.baidu.com', ['geosite:cn', 'geoip:cn'], '全球直连'],
  ['nas.drj028.com', ['rule-set:forcedirect'], '全球直连'],
  ['router.lan', ['geosite:private', 'geoip:private'], '全球直连'],
  ['192.168.1.1', ['geoip:private'], '全球直连'],
  ['unknown.example', [], '节点选择']
];

function matchesAtom(atom, tags, network, port) {
  const [kind, value] = atom.toLowerCase().split(',');
  if (kind === 'network') return value === network;
  if (kind === 'dst-port') return Number(value) === port;
  if (kind === 'match') return true;
  assert.ok(['geosite', 'geoip', 'rule-set'].includes(kind), `unsupported test matcher: ${kind}`);
  return tags.includes(`${kind}:${value}`);
}

function mihomoResult(rules, tags, network, port) {
  for (const rule of rules) {
    if (rule.startsWith('AND,')) {
      const atoms = [...rule.matchAll(/\(([^()]+)\)/g)].map((match) => match[1]);
      if (atoms.every((atom) => matchesAtom(atom, tags, network, port))) return 'REJECT';
    } else if (matchesAtom(rule, tags, network, port)) {
      const parts = rule.split(',');
      return parts[0] === 'match' ? parts[1] : parts[2];
    }
  }
}

function singResult(config, tags, network, port) {
  const sets = tags.map((tag) => tag.replace(/^rule-set:/, '').replace(':', '-'));
  for (const rule of config.rules) {
    if (['sniff', 'hijack-dns'].includes(rule.action)) continue;
    if (rule.ip_is_private && !tags.includes('geoip:private')) continue;
    if (rule.rule_set && !sets.includes(rule.rule_set)) continue;
    if (rule.network && rule.network !== network) continue;
    if (rule.port && rule.port !== port) continue;
    return rule.action === 'reject' ? 'REJECT' : rule.outbound;
  }
  return config.final;
}

test('both clients preserve first-match routing and scope QUIC to proxy policies', () => {
  for (const enabled of [false, true]) {
    global.$arguments = { quic: enabled };
    delete require.cache[require.resolve('../src/substore/convert')];
    const clash = require('../src/substore/convert').main({}).rules;
    const sing = buildRouteConfig({ quicEnabled: enabled });
    for (const [domain, tags, policy] of cases) {
      for (const network of ['tcp', 'udp']) {
        const expected = !enabled && network === 'udp' && policy !== '全球直连' ? 'REJECT' : policy;
        assert.equal(mihomoResult(clash, tags, network, 443), expected, `Mihomo ${domain} ${network}`);
        assert.equal(singResult(sing, tags, network, 443), expected, `sing-box ${domain} ${network}`);
      }
    }
    assert.equal(singResult(sing, [], 'tcp', 853), '节点选择');
    assert.equal(singResult(buildRouteConfig({ quicEnabled: enabled, blockDot: true }), [], 'tcp', 853), 'REJECT');
  }
});

test('Play DNS exception precedes CN, and Geo update ownership is preserved', () => {
  assert.deepEqual(buildDnsConfig().rules[0], { rule_set: 'geosite-google-play', server: 'google' });
  const config = main({});
  assert.equal(config.dns['fake-ip-range'], '198.18.0.1/16');
  assert.equal(config['geo-auto-update'], true);
  assert.equal(config['geo-update-interval'], 24);
  assert.equal(main({ 'geo-auto-update': false })['geo-auto-update'], false);
  assert.equal(main({ 'geo-update-interval': 48 })['geo-update-interval'], 48);
});

test('strict lint catches suffix coverage without confusing sibling domains', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-lint-'));
  try {
    const file = path.join(dir, 'sample.yaml');
    const lint = () => spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/lint-rules.js'), '--strict'], { cwd: dir, encoding: 'utf8' });
    fs.writeFileSync(file, 'payload:\n  - +.example.com\n  - +.api.example.com\n');
    const covered = lint();
    assert.equal(covered.status, 1);
    assert.match(covered.stdout, /REDUNDANT.*api.example.com/);
    fs.writeFileSync(file, 'payload:\n  - +.example.com\n  - +.otherexample.com\n');
    assert.equal(lint().status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Mihomo DNS has independent resolvers and a fail-closed proxy group', () => {
  const first = main({});
  const dns = first.dns;
  assert.equal(dns['nameserver-policy'], undefined);
  assert.equal(dns.fallback, undefined);
  assert.equal(dns['respect-rules'], false);
  assert.ok(dns.nameserver.every((url) => url.startsWith('https://') && url.endsWith('#DNS代理')));
  for (const key of ['default-nameserver', 'direct-nameserver', 'proxy-server-nameserver']) {
    assert.ok(dns[key].every((url) => url.endsWith('#DIRECT')));
    dns[key].push('invalid');
    assert.ok(!main({}).dns[key].includes('invalid'));
  }
  assert.ok(!dns['fake-ip-filter'].includes('geosite:cn'));
  assert.ok(!dns['fake-ip-filter'].includes('rule-set:cnsite'));
  assert.ok(dns['fake-ip-filter'].includes('rule-set:fakeipfilter'));
  const group = first['proxy-groups'].find((item) => item.name === 'DNS代理');
  assert.equal(group.type, 'url-test');
  assert.equal(group['include-all'], true);
  assert.equal(group['exclude-type'], 'direct|compatible|pass');
  assert.deepEqual(group.proxies, ['REJECT']);
});
