const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSingBoxConfig } = require('../src/sing-box/config');

test('OpenWrt owns DNS, bootstraps without the proxy, and redirects LAN traffic', () => {
  const node = { type: 'anytls', tag: '香港 01', server: 'proxy.example', server_port: 443, password: 'dummy' };
  const config = buildSingBoxConfig({ outbounds: [node] }, { openwrt: true });
  assert.equal(config.outbounds.find(x => x.tag === node.tag).server, node.server);
  assert.equal(config.dns.reverse_mapping, true);
  const bootstrap = config.dns.servers.find(x => x.tag === 'bootstrap');
  assert.equal(bootstrap.type, 'https');
  assert.equal(bootstrap.server, '223.5.5.5');
  assert.equal(bootstrap.detour, undefined);
  assert.equal(bootstrap.domain_resolver, undefined);
  assert.equal(config.route.default_domain_resolver, 'bootstrap');
  assert.equal(config.http_clients[0].detour, '自动选择');
  assert.equal(config.dns.rules[0].rule_set, 'geosite-google-play');
  assert.ok(config.dns.rules.some(x => x.rule_set.includes('forcedirect') && x.server === 'local'));
  assert.deepEqual(config.inbounds.find(x => x.tag === 'dns-in'), {
    type: 'direct', tag: 'dns-in', listen: '127.0.0.1', listen_port: 6450
  });
  const tun = config.inbounds.find(x => x.type === 'tun');
  assert.equal(tun.auto_route, true);
  assert.equal(tun.auto_redirect, true);
  assert.equal(tun.dns_mode, 'hijack');
  assert.equal(tun.interface_name, 'sing-box-tun');
  assert.equal(config.experimental.clash_api.external_controller, '127.0.0.1:9090');
});

test('OpenWrt exposes its API on LAN only when authentication is provided', () => {
  const config = buildSingBoxConfig({}, { openwrt: true, apiSecret: 'test-only' });
  assert.equal(config.experimental.clash_api.external_controller, '0.0.0.0:9090');
  assert.equal(config.experimental.clash_api.secret, 'test-only');
});

test('authenticated mixed proxy binds only its LAN address and keeps both localhost listeners unauthenticated', () => {
  const users = [{ username: 'test-user', password: 'test-password' }];
  const config = buildSingBoxConfig({}, { openwrt: true, mixedListen: '10.0.0.1', mixedUsers: users });
  assert.deepEqual(config.inbounds.filter(x => x.type === 'mixed'), [
    { type: 'mixed', tag: 'mixed-in', listen: '10.0.0.1', listen_port: 7890, users },
    { type: 'mixed', tag: 'mixed-loopback', listen: '127.0.0.1', listen_port: 7890 },
    { type: 'mixed', tag: 'mixed-loopback-v6', listen: '::1', listen_port: 7890 }
  ]);
});

test('mixed proxy without users retains the previous wildcard listener', () => {
  const config = buildSingBoxConfig({}, { openwrt: true, mixedListen: '10.0.0.1', mixedUsers: [] });
  assert.deepEqual(config.inbounds.filter(x => x.type === 'mixed'), [
    { type: 'mixed', tag: 'mixed-in', listen: '0.0.0.0', listen_port: 7890 }
  ]);
});

test('explicit mixed, HTTP and SOCKS ports each preserve LAN authentication and localhost access', () => {
  const users = [{ username: 'test-user', password: 'test-password' }];
  const config = buildSingBoxConfig({}, { openwrt: true, mixedListen: '10.0.0.1', mixedUsers: users, mixedPort: 7893, httpPort: 7890, socksPort: 7891 });
  for (const [type, port] of [['mixed', 7893], ['http', 7890], ['socks', 7891]]) {
    assert.deepEqual(config.inbounds.filter(x => x.type === type), [
      { type, tag: `${type}-in`, listen: '10.0.0.1', listen_port: port, users },
      { type, tag: `${type}-loopback`, listen: '127.0.0.1', listen_port: port },
      { type, tag: `${type}-loopback-v6`, listen: '::1', listen_port: port }
    ]);
  }
});

test('optional HTTP and SOCKS ports without users create only wildcard listeners', () => {
  const config = buildSingBoxConfig({}, { openwrt: true, mixedPort: 7893, httpPort: 7890, socksPort: 7891 });
  assert.deepEqual(config.inbounds.filter(x => ['mixed', 'http', 'socks'].includes(x.type)), [
    { type: 'mixed', tag: 'mixed-in', listen: '0.0.0.0', listen_port: 7893 },
    { type: 'http', tag: 'http-in', listen: '0.0.0.0', listen_port: 7890 },
    { type: 'socks', tag: 'socks-in', listen: '0.0.0.0', listen_port: 7891 }
  ]);
});

test('mixed authentication rejects missing or conflicting listener addresses and malformed users', () => {
  const options = { openwrt: true, mixedUsers: [{ username: 'test-user', password: 'test-password' }] };
  for (const mixedListen of [undefined, '', '0.0.0.0', '::', '127.0.0.1', '::1']) {
    assert.throws(() => buildSingBoxConfig({}, { ...options, mixedListen }), /specific LAN IP/);
  }
  assert.throws(() => buildSingBoxConfig({}, { openwrt: true, mixedUsers: {} }), /mixedUsers must be an array/);
  assert.throws(() => buildSingBoxConfig({}, { openwrt: true, mixedUsers: [{ username: 'test-user' }] }), /mixedUsers must be an array/);
});
