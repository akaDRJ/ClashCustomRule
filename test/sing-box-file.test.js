const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const sourcePath = path.join(__dirname, '../src/substore/convert-sing-box.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function loadFileScript(args = {}, produceArtifact) {
  // Sub-Store injects these arguments when evaluating the Script Operator.
  return new Function('$arguments', 'produceArtifact', 'require', `
    const module = { exports: {} };
    ${source}
    return module.exports;
  `)(args, produceArtifact, createRequire(sourcePath));
}

const relay = { type: 'shadowsocks', tag: '香港 01', server: 'hk.example.com', server_port: 443, method: 'aes-128-gcm', password: 'redacted' };

test('Sub-Store file operator produces a standard sing-box collection and writes its JSON content', async () => {
  const calls = [];
  const landing = {
    type: 'vless', tag: '落地 台湾 01', server: 'tw.example.com', server_port: 443,
    uuid: 'redacted', detour: '前置代理',
    tls: { enabled: true, reality: { enabled: true, public_key: 'redacted', short_id: 'abcd' } },
    transport: { type: 'ws', path: '/proxy', headers: { Host: 'example.com' } }
  };
  const script = loadFileScript({ collection: 'AKCDN Fallback', openwrt: 'true', apiSecret: 'test-api-secret' }, async (request) => {
    calls.push(request);
    return JSON.stringify({ outbounds: [relay, landing], endpoints: [] });
  });
  const input = { $content: '{}', $files: ['{}'], $options: { noCache: true }, $file: { name: 'AKCDN sing-box', type: 'file' } };
  const result = await script.operator(input);
  assert.deepEqual(calls, [{ type: 'collection', name: 'AKCDN Fallback', platform: 'sing-box' }]);
  assert.equal(result.$options, input.$options);
  assert.equal(result.$files, input.$files);
  assert.equal(result.$file, input.$file);
  assert.equal(input.$content, '{}');
  const config = JSON.parse(result.$content);
  assert.deepEqual(config.outbounds.find((outbound) => outbound.tag === landing.tag), landing);
  assert.equal(config.experimental.clash_api.secret, 'test-api-secret');
  assert.equal(config.experimental.clash_api.external_controller, '0.0.0.0:9090');
  assert.ok(config.inbounds.some((inbound) => inbound.tag === 'dns-in'));
});

test('ordinary file JSON sources work without a collection or produceArtifact', async () => {
  const script = loadFileScript();
  const result = await script.operator({ $content: JSON.stringify({ outbounds: [relay] }), $files: [] });
  const config = JSON.parse(result.$content);
  assert.deepEqual(config.outbounds.find((outbound) => outbound.tag === relay.tag), relay);
  assert.equal(typeof script.operator([relay]), 'string');
  assert.equal(JSON.parse(script.main(JSON.stringify({ outbounds: [relay] }))).route.final, '节点选择');
});

test('file generation propagates collection and malformed JSON errors', async () => {
  const input = { $content: '{}', $files: [] };
  const unavailable = loadFileScript({ collection: 'AKCDN Fallback' });
  await assert.rejects(unavailable.operator(input), /produceArtifact is unavailable/);
  const failing = loadFileScript({ collection: 'AKCDN Fallback' }, async () => { throw new Error('collection unavailable'); });
  await assert.rejects(failing.operator(input), /collection unavailable/);
  await assert.rejects(loadFileScript().operator({ $content: 'not JSON', $files: [] }), SyntaxError);
  assert.equal(input.$content, '{}');
});

test('Sub-Store mixedUsers JSON arguments preserve LAN authentication and both loopback exemptions', () => {
  const users = [{ username: 'test-user', password: 'test-password' }];
  const args = { openwrt: 'true', mixedListen: '10.0.0.1', mixedUsers: JSON.stringify(users), mixedPort: '7893', httpPort: '7890', socksPort: '7891' };
  const script = loadFileScript(args);
  const mixed = script.build({}).inbounds.filter(x => x.type === 'mixed');
  assert.deepEqual(mixed[0], { type: 'mixed', tag: 'mixed-in', listen: '10.0.0.1', listen_port: 7893, users });
  assert.deepEqual(mixed.slice(1).map(x => [x.listen, x.listen_port, x.users]), [['127.0.0.1', 7893, undefined], ['::1', 7893, undefined]]);
  assert.equal(script.build({}).inbounds.find(x => x.tag === 'http-in').listen_port, 7890);
  assert.equal(script.build({}).inbounds.find(x => x.tag === 'socks-in').listen_port, 7891);
  assert.deepEqual(script.build({}, { mixedUsers: users }).inbounds.filter(x => x.type === 'mixed'), mixed);
  assert.throws(() => loadFileScript({ ...args, mixedUsers: 'malformed-private-value' }).build({}), (error) => {
    assert.match(error.message, /mixedUsers must be a JSON array/);
    assert.equal(error.message.includes('malformed-private-value'), false);
    return true;
  });
});

test('private file-content options preserve authentication without private script arguments or logging', async (t) => {
  const logs = ['log', 'warn', 'error', 'info'].map(method => t.mock.method(console, method, () => {}));
  const users = [{ username: 'private-test-user', password: 'private-test-password' }];
  const options = { openwrt: true, apiSecret: 'private-test-api-key', mixedUsers: users, mixedListen: '10.0.0.1', mixedPort: 7893, httpPort: 7890, socksPort: 7891 };
  for (const args of [{}, { collection: 'AKCDN Fallback' }]) {
    const script = loadFileScript(args, async () => JSON.stringify({ outbounds: [relay], endpoints: [] }));
    const result = await script.operator({ $content: JSON.stringify({ options, outbounds: [relay] }), $files: [] });
    const config = JSON.parse(result.$content);
    assert.equal(config.experimental.clash_api.secret, options.apiSecret);
    assert.equal(config.experimental.clash_api.external_controller, '0.0.0.0:9090');
    assert.equal(config.outbounds.some(outbound => outbound.tag === relay.tag), true);
    for (const [type, port] of [['mixed', 7893], ['http', 7890], ['socks', 7891]]) {
      const listener = config.inbounds.find(inbound => inbound.tag === `${type}-in`);
      assert.equal(listener.listen, '10.0.0.1');
      assert.equal(listener.listen_port, port);
      assert.equal(listener.users[0].username, users[0].username);
      assert.equal(listener.users[0].password, users[0].password);
    }
  }
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});
