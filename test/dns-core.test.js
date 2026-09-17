const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { Resolver } = require('node:dns').promises;
const YAML = require('yaml');
const { main } = require('../src/substore/convert');
const binary = process.env.MIHOMO_BIN || 'mihomo';
const available = spawnSync(binary, ['-v'], { windowsHide: true }).status === 0;

test('real Mihomo isolates DNS paths and refuses proxy DNS when no proxy remains', { skip: !available, timeout: 20000 }, async () => {
  const servers = [], sockets = new Set(), queries = { normal: [], direct: [], node: [] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mihomo-dns-'));
  let core, log = '', socksConnections = 0;
  async function listen(handler) {
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
      handler(socket);
    });
    servers.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return server.address().port;
  }
  async function dnsServer(kind) {
    return listen((socket) => {
      let pending = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= 2 && pending.length >= pending.readUInt16BE(0) + 2) {
          const size = pending.readUInt16BE(0), request = pending.subarray(2, size + 2);
          pending = pending.subarray(size + 2);
          let offset = 12; const labels = [];
          while (request[offset]) { const len = request[offset++]; labels.push(request.toString('ascii', offset, offset + len)); offset += len; }
          queries[kind].push(labels.join('.'));
          const questionEnd = offset + 5;
          const header = Buffer.from(request.subarray(0, 12));
          header.writeUInt16BE(0x8180, 2); header.writeUInt16BE(1, 6);
          header.writeUInt16BE(0, 8); header.writeUInt16BE(0, 10);
          const answer = Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 0, 0, 4, 127, 0, 0, 1]);
          const body = Buffer.concat([header, request.subarray(12, questionEnd), answer]);
          const prefix = Buffer.alloc(2); prefix.writeUInt16BE(body.length);
          socket.write(Buffer.concat([prefix, body]));
        }
      });
    });
  }
  try {
    const normalPort = await dnsServer('normal'), directPort = await dnsServer('direct'), nodePort = await dnsServer('node');
    const targetPort = await listen((socket) => socket.on('data', () => socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK')));
    const socksPort = await listen((socket) => {
      socket.once('data', () => {
        socket.write(Buffer.from([5, 0]));
        socket.once('data', (request) => {
          socksConnections++;
          if (request.readUInt16BE(request.length - 2) === 80) {
            socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
            socket.once('data', () => socket.end('HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n'));
            return;
          }
          if (request[3] !== 1 || request.readUInt16BE(request.length - 2) !== normalPort) {
            socket.end(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0])); return;
          }
          const upstream = net.connect(normalPort, '127.0.0.1', () => {
            socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
            socket.pipe(upstream).pipe(socket);
          });
          sockets.add(upstream);
          upstream.on('error', () => socket.destroy());
          socket.on('close', () => upstream.destroy());
        });
      });
    });
    // Let the OS choose free ports; release reservations immediately before core startup.
    const controllerPort = await listen(() => {}), mixedPort = await listen(() => {}), dnsPort = await listen(() => {});
    for (const server of servers.slice(-3)) await new Promise((resolve) => server.close(resolve));
    const generated = main({});
    const group = generated['proxy-groups'].find((item) => item.name === 'DNS代理');
    const config = {
      'external-controller': `127.0.0.1:${controllerPort}`, 'mixed-port': mixedPort,
      'log-level': 'debug', ipv6: false,
      proxies: [{ name: 'TestProxy', type: 'socks5', server: 'node.test', port: socksPort }, { name: 'UnsafeDirect', type: 'direct' }],
      'proxy-groups': [{ ...group, url: 'http://probe.invalid', lazy: true }],
      'rule-providers': { fakeipfilter: { type: 'inline', behavior: 'domain', payload: ['+.real.test'] } },
      dns: { ...generated.dns, listen: `127.0.0.1:${dnsPort}`,
        nameserver: [`tcp://127.0.0.1:${normalPort}#DNS代理`],
        'default-nameserver': [`tcp://127.0.0.1:${nodePort}#DIRECT`],
        'proxy-server-nameserver': [`tcp://127.0.0.1:${nodePort}#DIRECT`],
        'direct-nameserver': [`tcp://127.0.0.1:${directPort}#DIRECT`] },
      rules: ['MATCH,DIRECT']
    };
    const file = path.join(dir, 'config.yaml'); fs.writeFileSync(file, YAML.stringify(config));
    core = spawn(binary, ['-d', dir, '-f', file], { windowsHide: true });
    core.stdout.on('data', (data) => { log += data; }); core.stderr.on('data', (data) => { log += data; });
    const base = `http://127.0.0.1:${controllerPort}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/version`)).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, log);
    const groupUrl = `${base}/proxies/${encodeURIComponent('DNS代理')}`;
    let state = await (await fetch(groupUrl)).json();
    assert.ok(!state.all.includes('UnsafeDirect'));
    assert.ok(state.all.includes('REJECT'));
    assert.ok((await fetch(groupUrl, { method: 'PUT', body: JSON.stringify({ name: 'TestProxy' }) })).ok);
    await fetch(`${base}/proxies/TestProxy/delay?url=http%3A%2F%2Fprobe.invalid&timeout=1000`);
    const resolver = new Resolver({ timeout: 1000, tries: 1 }); resolver.setServers([`127.0.0.1:${dnsPort}`]);
    assert.deepEqual(await resolver.resolve4('proxy.real.test'), ['127.0.0.1']);
    assert.ok(queries.normal.includes('proxy.real.test'));
    assert.ok(queries.node.includes('node.test'));
    assert.ok(socksConnections > 0);
    assert.ok(!queries.direct.includes('proxy.real.test'));
    const fake = await resolver.resolve4('direct.test');
    assert.ok(fake[0].startsWith('198.18.'));
    await new Promise((resolve, reject) => {
      const socket = net.connect(mixedPort, '127.0.0.1', () => socket.write(`GET http://direct.test:${targetPort}/ HTTP/1.1\r\nHost: direct.test:${targetPort}\r\nConnection: close\r\n\r\n`));
      sockets.add(socket); socket.on('error', reject); socket.on('data', () => { socket.destroy(); resolve(); });
      socket.setTimeout(3000, () => { socket.destroy(); reject(new Error(log)); });
    });
    assert.ok(queries.direct.includes('direct.test'));
    assert.ok(!queries.normal.includes('direct.test'));
    config.proxies = [{ name: 'UnsafeDirect', type: 'direct' }];
    assert.ok((await fetch(`${base}/configs?force=true`, { method: 'PUT', body: JSON.stringify({ payload: YAML.stringify(config) }) })).ok);
    state = await (await fetch(groupUrl)).json();
    assert.deepEqual(state.all, ['REJECT']);
    const before = queries.normal.length;
    await assert.rejects(resolver.resolve4('blocked.real.test'));
    assert.equal(queries.normal.length, before, 'empty proxy group must not send DNS directly');
  } catch (error) {
    error.message += `\n${log}\n${JSON.stringify(queries)}`;
    throw error;
  } finally {
    if (core && core.exitCode === null) { core.kill(); await new Promise((resolve) => core.once('exit', resolve)); }
    for (const socket of sockets) socket.destroy();
    for (const server of servers) if (server.listening) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
