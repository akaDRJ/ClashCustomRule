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
      // Regional membership now deliberately excludes self-hosted nodes; tested separately.
      if (group.name === '新加坡节点') continue;
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

test('self-hosted shortcuts are near the top and beside low-cost groups, not at the country tail', () => {
  for (const args of modes) {
    for (const withLowCost of [false, true]) {
      const proxies = [nbDirect, nbCdn, airport, ...hongKong,
        { name: '🇭🇰 Airport 香港 01', type: 'ss' },
        ...(withLowCost ? [{ name: '🇯🇵 Airport 日本 0.5x', type: 'ss' }] : [])];
      const groups = Object.fromEntries(convert(proxies, args)['proxy-groups'].map((g) => [g.name, g]));
      const hosted = ['新加坡自建', '香港自建'];
      for (const parent of ['节点选择', 'YouTube', 'Google', '人工智能']) {
        assert.deepEqual(groups[parent].proxies.slice(1, 3), hosted, `${parent}: priority shortcuts`);
        assert.ok(groups[parent].proxies.indexOf('香港自建') < groups[parent].proxies.indexOf('香港节点'));
      }
      assert.equal(groups['节点选择'].proxies[0], '自动选择');
      assert.equal(groups.YouTube.proxies[0], '节点选择');
      const global = groups.GLOBAL.proxies;
      const anchor = global.indexOf(groups['低倍率节点'] ? '低倍率节点' : '强制代理');
      assert.deepEqual(global.slice(anchor - hosted.length, anchor), hosted);
      assert.ok(global.indexOf('香港自建') < global.indexOf('香港节点'));
    }
  }
});

test('prioritizing self-hosted shortcuts does not replace landing or front-proxy defaults', () => {
  const proxies = [nbDirect, nbCdn,
    { name: '🇹🇼 落地 台湾 01', type: 'vless', 'dialer-proxy': '前置代理' },
    { name: '🇭🇰 Airport 香港 01', type: 'ss' }];
  const groups = Object.fromEntries(convert(proxies, { landing: true })['proxy-groups'].map((g) => [g.name, g]));
  assert.deepEqual(groups['节点选择'].proxies.slice(0, 2), ['台湾落地', '新加坡自建']);
  assert.equal(groups['前置代理'].proxies[0], '自动选择');
  assert.ok(groups['前置代理'].proxies.indexOf('新加坡自建') > groups['前置代理'].proxies.indexOf('香港节点'));
});

function members(group, proxies) {
  if (group.proxies) return group.proxies;
  const regex = (pattern) => new RegExp(pattern.replace(/^\(\?i\)/, ''), 'i');
  return proxies.filter((proxy) => regex(group.filter).test(proxy.name) &&
    !regex(group['exclude-filter']).test(proxy.name)).map((proxy) => proxy.name);
}

test('ordinary country groups and self-hosted groups have disjoint members across modes', () => {
  const hkAirport = { name: '🇭🇰 Airport 香港 01', type: 'ss' };
  const proxies = [nbDirect, nbCdn, airport, ...hongKong, hkAirport];
  for (const args of modes) {
    const groups = Object.fromEntries(convert(proxies, args)['proxy-groups'].map((g) => [g.name, g]));
    assert.deepEqual(members(groups['新加坡节点'], proxies), [airport.name]);
    assert.deepEqual(members(groups['香港节点'], proxies), [hkAirport.name]);
    assert.deepEqual(groups['新加坡自建'].proxies, [nbDirect.name, nbCdn.name]);
    assert.deepEqual(groups['香港自建'].proxies, hongKong.map((p) => p.name));
    // The request concerns ordinary country groups, not the existing global auto policy.
    const globalAutoExclude = new RegExp(groups['自动选择']['exclude-filter'].replace(/^\(\?i\)/, ''), 'i');
    assert.equal(globalAutoExclude.test(nbDirect.name), false);
    assert.equal(globalAutoExclude.test(nbCdn.name), false);
  }
});

test('a region containing only self-hosted nodes has no empty ordinary group or dangling reference', () => {
  const proxies = [nbDirect, nbCdn, ...hongKong];
  for (const args of modes) {
    const result = convert(proxies, args);
    const groups = Object.fromEntries(result['proxy-groups'].map((g) => [g.name, g]));
    assert.ok(groups['新加坡自建'] && groups['香港自建']);
    assert.ok(!groups['新加坡节点'] && !groups['香港节点']);
    for (const group of result['proxy-groups']) {
      assert.ok(!(group.proxies || []).includes('新加坡节点'));
      assert.ok(!(group.proxies || []).includes('香港节点'));
    }
    assert.equal(groups['节点选择'].proxies[0], '自动选择');
  }
});

test('regex-mode country exclusion escapes exact self-hosted names and retains dialer exclusion', () => {
  const special = { ...nbDirect, name: '🇸🇬 NB 新加坡 [0.5]+(02).*' };
  const chained = { name: '🇸🇬 Other 新加坡 chained 01', type: 'vless', 'dialer-proxy': '前置代理' };
  const proxies = [special, airport, chained];
  const groups = Object.fromEntries(convert(proxies, { regex: true, landing: true })['proxy-groups'].map((g) => [g.name, g]));
  assert.deepEqual(members(groups['新加坡节点'], proxies), [airport.name]);
  assert.deepEqual(groups['新加坡自建'].proxies, [special.name]);
});
