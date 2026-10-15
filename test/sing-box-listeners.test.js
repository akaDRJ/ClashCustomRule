const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSingBoxConfig } = require('../src/sing-box/config');

test('authenticated mixed proxy binds only its LAN address and keeps both localhost listeners unauthenticated', () => {
  const users = [{ username: 'test-user', password: 'test-password' }];
  const config = buildSingBoxConfig({}, { momo: true, mixedListen: '10.0.0.1', mixedUsers: users });
  assert.deepEqual(config.inbounds.filter(x => x.type === 'mixed'), [
    { type: 'mixed', tag: 'mixed-in', listen: '10.0.0.1', listen_port: 7890, users },
    { type: 'mixed', tag: 'mixed-loopback', listen: '127.0.0.1', listen_port: 7890 },
    { type: 'mixed', tag: 'mixed-loopback-v6', listen: '::1', listen_port: 7890 }
  ]);
});

test('mixed proxy without users retains the previous wildcard listener', () => {
  const config = buildSingBoxConfig({}, { momo: true, mixedListen: '10.0.0.1', mixedUsers: [] });
  assert.deepEqual(config.inbounds.filter(x => x.type === 'mixed'), [
    { type: 'mixed', tag: 'mixed-in', listen: '0.0.0.0', listen_port: 7890 }
  ]);
});

test('explicit mixed, HTTP and SOCKS ports each preserve LAN authentication and localhost access', () => {
  const users = [{ username: 'test-user', password: 'test-password' }];
  const config = buildSingBoxConfig({}, { momo: true, mixedListen: '10.0.0.1', mixedUsers: users, mixedPort: 7893, httpPort: 7890, socksPort: 7891 });
  for (const [type, port] of [['mixed', 7893], ['http', 7890], ['socks', 7891]]) {
    assert.deepEqual(config.inbounds.filter(x => x.type === type), [
      { type, tag: `${type}-in`, listen: '10.0.0.1', listen_port: port, users },
      { type, tag: `${type}-loopback`, listen: '127.0.0.1', listen_port: port },
      { type, tag: `${type}-loopback-v6`, listen: '::1', listen_port: port }
    ]);
  }
});

test('optional HTTP and SOCKS ports without users create only wildcard listeners', () => {
  const config = buildSingBoxConfig({}, { momo: true, mixedPort: 7893, httpPort: 7890, socksPort: 7891 });
  assert.deepEqual(config.inbounds.filter(x => ['mixed', 'http', 'socks'].includes(x.type)), [
    { type: 'mixed', tag: 'mixed-in', listen: '0.0.0.0', listen_port: 7893 },
    { type: 'http', tag: 'http-in', listen: '0.0.0.0', listen_port: 7890 },
    { type: 'socks', tag: 'socks-in', listen: '0.0.0.0', listen_port: 7891 }
  ]);
});

test('mixed authentication rejects missing or conflicting listener addresses and malformed users', () => {
  const options = { momo: true, mixedUsers: [{ username: 'test-user', password: 'test-password' }] };
  for (const mixedListen of [undefined, '', '0.0.0.0', '::', '127.0.0.1', '::1']) {
    assert.throws(() => buildSingBoxConfig({}, { ...options, mixedListen }), /specific LAN IP/);
  }
  assert.throws(() => buildSingBoxConfig({}, { momo: true, mixedUsers: {} }), /mixedUsers must be an array/);
  assert.throws(() => buildSingBoxConfig({}, { momo: true, mixedUsers: [{ username: 'test-user' }] }), /mixedUsers must be an array/);
});
