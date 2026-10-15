const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOutbounds, normalizeProxy } = require('../src/sing-box/outbounds');

test('native sing-box nodes retain complete transport, TLS, multiplex and protocol parameters', () => {
  const nodes = [
    {
      type: 'vless', tag: '落地 VLESS', server: 'tw.example.com', server_port: 443,
      uuid: 'redacted', flow: 'xtls-rprx-vision', packet_encoding: 'xudp',
      tls: { enabled: true, server_name: 'example.com', utls: { enabled: true, fingerprint: 'chrome' }, reality: { enabled: true, public_key: 'redacted', short_id: 'abcd' } },
      transport: { type: 'ws', path: '/proxy', headers: { Host: 'example.com' }, max_early_data: 2048, early_data_header_name: 'Sec-WebSocket-Protocol' },
      multiplex: { enabled: true, protocol: 'h2mux' }, detour: '前置代理'
    },
    { type: 'vmess', tag: '落地 VMess', server: 'tw.example.com', server_port: 443, uuid: 'redacted', security: 'auto', alter_id: 0, global_padding: true, authenticated_length: true, transport: { type: 'http', host: ['example.com'], path: '/' }, detour: '前置代理' },
    { type: 'anytls', tag: '落地 AnyTLS', server: 'tw.example.com', server_port: 443, password: 'redacted', idle_session_check_interval: '30s', idle_session_timeout: '30s', min_idle_session: 2, tls: { enabled: true, server_name: 'example.com' }, detour: '前置代理' },
    { type: 'shadowsocks', tag: '落地 SS', server: 'tw.example.com', server_port: 443, method: '2022-blake3-aes-128-gcm', password: 'redacted', udp_over_tcp: { enabled: true, version: 2 }, detour: '前置代理' }
  ];
  for (const node of nodes) assert.deepEqual(normalizeProxy(node), node);
});

test('legacy dialer-proxy maps to detour without overriding an existing native chain', () => {
  const proxy = { name: '落地 SS', type: 'ss', server: 'tw.example.com', port: 443, cipher: 'aes-128-gcm', password: 'redacted', 'dialer-proxy': '前置代理' };
  const normalized = normalizeProxy(proxy);
  assert.equal(normalized.detour, '前置代理');
  assert.equal(normalized.type, 'shadowsocks');
  assert.equal(normalized['dialer-proxy'], undefined);
  assert.equal(proxy['dialer-proxy'], '前置代理');
  const native = normalizeProxy({ ...normalized, 'dialer-proxy': 'other' });
  assert.equal(native.detour, '前置代理');
  assert.equal(native['dialer-proxy'], undefined);
});

test('landing defaults are selectable and every relay choice excludes chained, landing and IX nodes', () => {
  const node = (tag, detour) => ({ type: 'anytls', tag, server: 'example.com', server_port: 443, password: 'redacted', ...(detour ? { detour } : {}) });
  const outbounds = buildOutbounds([
    node('香港 01'), node('台湾 02'), node('美国 0.5x'), node('🇨🇳 IX 台湾 01'),
    node('落地 台湾 01', '前置代理'), node('另一链式', '香港 01'), node('落地 台湾 直连')
  ]);
  const byTag = Object.fromEntries(outbounds.map((outbound) => [outbound.tag, outbound]));
  const relayTags = ['香港 01', '台湾 02', '美国 0.5x'];
  assert.deepEqual(byTag['自动选择'].outbounds, relayTags);
  assert.deepEqual(byTag['中转节点'].outbounds, relayTags);
  assert.deepEqual(byTag['手动切换'].outbounds, relayTags);
  assert.deepEqual(byTag['台湾节点'].outbounds, ['台湾 02']);
  assert.deepEqual(byTag['IX节点'].outbounds, ['🇨🇳 IX 台湾 01']);
  assert.equal(byTag['IX节点'].type, 'selector');
  assert.equal(byTag['落地节点'].type, 'selector');
  assert.equal(byTag['落地节点'].default, '落地 台湾 01');
  assert.ok(byTag['落地节点'].outbounds.includes(byTag['落地节点'].default));
  assert.equal(byTag['节点选择'].default, '落地节点');
  assert.ok(byTag['节点选择'].outbounds.includes('落地节点'));
  assert.equal(byTag['前置代理'].default, '中转节点');
  assert.equal(outbounds.some((outbound) => ['fallback', 'smart'].includes(outbound.type)), false);

  const visit = (tag, parents = []) => {
    assert.ok(byTag[tag], `missing outbound ${tag}`);
    assert.equal(parents.includes(tag), false, `circular outbound: ${[...parents, tag].join(' -> ')}`);
    const outbound = byTag[tag];
    for (const child of [...(outbound.outbounds || []), ...(outbound.detour ? [outbound.detour] : [])]) visit(child, [...parents, tag]);
  };
  for (const outbound of outbounds) visit(outbound.tag);
  for (const tag of byTag['前置代理'].outbounds) {
    assert.deepEqual(byTag[tag].outbounds.every((child) => relayTags.includes(child)), true);
  }
});

test('landing groups reject a missing independent relay and collisions with their group tags', () => {
  const node = (tag, detour) => ({ type: 'anytls', tag, server: 'example.com', server_port: 443, password: 'redacted', ...(detour ? { detour } : {}) });
  assert.throws(() => buildOutbounds([node('落地 台湾 01', '前置代理')]), /No independent nodes/);
  assert.throws(() => buildOutbounds([node('前置代理'), node('落地 台湾 01', '前置代理')]), /conflicts with generated group/);
});

test('unsupported full-certificate pins exclude whole nodes with one summary warning', (t) => {
  const warning = t.mock.method(console, 'warn', () => {});
  const incompatible = Array.from({ length: 20 }, (_, index) => ({
    type: 'hysteria2', tag: `LX 香港 ${index + 1}`, server: 'example.com', server_port: 443,
    password: 'redacted', tls: { enabled: true, insecure: true, certificate_sha256: ['redacted'] }
  }));
  const compatible = { type: 'anytls', tag: '香港 01', server: 'example.com', server_port: 443, password: 'redacted', tls: { enabled: true } };
  const outbounds = buildOutbounds([...incompatible, compatible]);
  assert.deepEqual(outbounds.filter((outbound) => outbound.server), [compatible]);
  assert.deepEqual(outbounds.find((outbound) => outbound.tag === '自动选择').outbounds, ['香港 01']);
  assert.equal(warning.mock.callCount(), 1);
  assert.match(warning.mock.calls[0].arguments[0], /Excluded 20 nodes: tls\.certificate_sha256/);
  assert.equal(normalizeProxy(incompatible[0]), null);
  assert.deepEqual(incompatible[0].tls, { enabled: true, insecure: true, certificate_sha256: ['redacted'] });
});

test('official public-key pins and all other native TLS settings remain unchanged', (t) => {
  const warning = t.mock.method(console, 'warn', () => {});
  const proxy = {
    type: 'hysteria2', tag: '香港 01', server: 'example.com', server_port: 443,
    password: 'redacted', tls: { enabled: true, insecure: true, certificate_public_key_sha256: ['redacted'], server_name: 'example.com' }
  };
  assert.deepEqual(normalizeProxy(proxy), proxy);
  assert.deepEqual(buildOutbounds([proxy]).find((outbound) => outbound.tag === proxy.tag), proxy);
  assert.equal(warning.mock.callCount(), 0);
});
