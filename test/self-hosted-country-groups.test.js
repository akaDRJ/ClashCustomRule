const test = require('node:test');
const assert = require('node:assert/strict');

function convert(proxies, args = {}) {
  const modulePath = require.resolve('../src/substore/convert');
  delete require.cache[modulePath];
  global.$arguments = args;
  return require(modulePath).main({ proxies: structuredClone(proxies) });
}

const nbDirect = {
  name: '🇸🇬 NB 新加坡 02', type: 'vless', server: '192.0.2.2', port: 443,
  'reality-opts': { 'public-key': 'fixture-key' }, network: 'tcp'
};
const nbCdn = {
  name: '🇸🇬 NB 新加坡 01', type: 'vless', server: 'cdn.example', port: 443,
  network: 'xhttp', 'xhttp-opts': { host: 'tunnel.example' }
};
const hongKong = [
  { name: '🇭🇰 Alpha 香港 自建 01', type: 'ss' },
  { name: '🇭🇰 Beta HK 自建 CDN 02', type: 'trojan' }
];
const airport = { name: '🇸🇬 良心云 新加坡 01', type: 'vless', 'reality-opts': {} };

const modes = [
  {}, { regex: true }, { smart: true }, { smart: true, regex: true },
  { loadbalance: true }, { full: true, android: true },
  { landing: true }, { landing: true, akcdnfallback: true }
];

test('self-hosted country selectors include both NB direct and CDN paths across modes', () => {
  const proxies = [nbDirect, nbCdn, airport, ...hongKong];
  for (const args of modes) {
    const result = convert(proxies, args);
    const groups = Object.fromEntries(result['proxy-groups'].map((g) => [g.name, g]));
    assert.deepEqual(groups['新加坡自建'].proxies, [nbDirect.name, nbCdn.name]);
    assert.deepEqual(groups['香港自建'].proxies, hongKong.map((p) => p.name));
    for (const name of ['新加坡自建', '香港自建']) {
      assert.equal(groups[name].type, 'select');
      assert.match(groups[name].icon, /\/flag\/.+\.svg$/);
      for (const field of ['include-all', 'filter', 'url', 'interval']) {
        assert.equal(groups[name][field], undefined, field);
      }
      for (const parent of ['节点选择', 'GLOBAL', 'YouTube', 'Google', '人工智能']) {
        assert.ok(groups[parent].proxies.includes(name), `${parent} exposes ${name}`);
      }
    }
    assert.ok(!groups['日本自建']);
    assert.ok(!groups['新加坡直连']);
    assert.deepEqual(result.proxies, proxies, 'node names and connection fields stay unchanged');
    assert.deepEqual(groups['全球直连'].proxies, ['DIRECT', '节点选择']);
  }
});

test('existing default choices and policy order survive the added ownership shortcuts', () => {
  const withoutLabel = (name) => name.replace(/\bNB\b/g, 'OtherVendor');
  for (const args of modes) {
    const input = [nbDirect, nbCdn, airport];
    const baseline = convert(input.map((p) => ({ ...p, name: withoutLabel(p.name) })), args);
    const updated = convert(input, args);
    const groups = Object.fromEntries(updated['proxy-groups'].map((g) => [g.name, g]));
    for (const group of baseline['proxy-groups']) {
      assert.deepEqual(
        { ...groups[group.name], ...(groups[group.name].proxies
          ? { proxies: groups[group.name].proxies.filter((n) => n !== '新加坡自建').map(withoutLabel) } : {}) },
        group,
        `${group.name}: only the new shortcut is added`
      );
    }
    assert.deepEqual(updated.rules, baseline.rules);
    assert.deepEqual(updated.dns, baseline.dns);
  }
});

test('ownership groups exclude airport direct labels, IX, landing, chained and unclassified nodes', () => {
  const excluded = [
    airport,
    { name: '🇭🇰 Airport 香港 直连 01', type: 'vless' },
    { name: '🇭🇰 IX 香港 自建 01', type: 'vless' },
    { name: '🇸🇬 落地 新加坡 自建 01', type: 'vless' },
    { name: '🇭🇰 Alpha 香港 自建 01', type: 'vless', 'dialer-proxy': '前置代理' },
    { name: 'Unknown 自建 01', type: 'ss' },
    { name: '香港自建', type: 'direct' }
  ];
  assert.ok(!convert(excluded)['proxy-groups'].some((g) => /^(香港|新加坡|Unknown)自建$/.test(g.name)));
  assert.ok(!convert([])['proxy-groups'].some((g) => /自建$/.test(g.name)));
});

test('NB ownership follows region without requiring a particular protocol or numeric suffix', () => {
  const future = { ...nbCdn, name: '🇭🇰 NB 香港 07' };
  const groups = convert([future])['proxy-groups'];
  assert.deepEqual(groups.find((g) => g.name === '香港自建').proxies, [future.name]);
  assert.ok(!groups.some((g) => g.name === '新加坡自建'));
});

test('IX and country landings keep their existing members and root preference', () => {
  const proxies = [
    nbDirect, nbCdn,
    { name: '🇸🇬 IX 新加坡 01', type: 'vmess' },
    { name: '🇹🇼 落地 台湾 01', type: 'vless', 'dialer-proxy': '前置代理' },
    { name: '🇭🇰 Airport 香港 01', type: 'ss' }
  ];
  const groups = Object.fromEntries(convert(proxies, { landing: true, akcdnfallback: true })['proxy-groups'].map((g) => [g.name, g]));
  assert.deepEqual(groups['IX节点'].proxies, ['🇸🇬 IX 新加坡 01']);
  assert.deepEqual(groups['台湾落地'].proxies, ['🇹🇼 落地 台湾 01']);
  assert.equal(groups['节点选择'].proxies[0], 'IX节点');
  assert.deepEqual(groups['新加坡自建'].proxies, [nbDirect.name, nbCdn.name]);
});

test('a node cannot shadow an automatically generated self-hosted country group', () => {
  assert.throws(() => convert([{ name: '香港自建', type: 'ss' }]),
    /Proxy name conflicts with generated group: 香港自建/);
});
