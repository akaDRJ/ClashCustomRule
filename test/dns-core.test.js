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

test('real Mihomo resolves real-IP exclusions without proxies and preserves Fake-IP elsewhere', { skip: !available, timeout: 15000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mihomo-dns-'));
  const sockets = new Set(), queries = [];
  let core, log = '';
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    let pending = Buffer.alloc(0);
    socket.on('data', chunk => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 2 && pending.length >= pending.readUInt16BE(0) + 2) {
        const size = pending.readUInt16BE(0), request = pending.subarray(2, size + 2);
        pending = pending.subarray(size + 2);
        let offset = 12;
        const labels = [];
        while (request[offset]) { const len = request[offset++]; labels.push(request.toString('ascii', offset, offset + len)); offset += len; }
        queries.push(labels.join('.'));
        const header = Buffer.from(request.subarray(0, 12));
        header.writeUInt16BE(0x8180, 2); header.writeUInt16BE(1, 6);
        header.writeUInt16BE(0, 8); header.writeUInt16BE(0, 10);
        const answer = Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 0, 0, 4, 127, 0, 0, 1]);
        const body = Buffer.concat([header, request.subarray(12, offset + 5), answer]);
        const prefix = Buffer.alloc(2); prefix.writeUInt16BE(body.length);
        socket.write(Buffer.concat([prefix, body]));
      }
    });
  });
  async function reservePort() {
    const reservation = net.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    return port;
  }
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const controllerPort = await reservePort(), dnsPort = await reservePort();
    const config = {
      'external-controller': `127.0.0.1:${controllerPort}`, ipv6: false,
      dns: { ...main({}).dns, listen: `127.0.0.1:${dnsPort}`,
        // Synthetic membership avoids a dependency on downloaded geodata.
        'fake-ip-filter': ['+.real.test'],
        'default-nameserver': [`tcp://127.0.0.1:${server.address().port}`],
        nameserver: [`tcp://127.0.0.1:${server.address().port}`] },
      rules: ['MATCH,DIRECT']
    };
    const file = path.join(dir, 'config.yaml');
    fs.writeFileSync(file, YAML.stringify(config));
    core = spawn(binary, ['-d', dir, '-f', file]);
    core.stdout.on('data', data => { log += data; }); core.stderr.on('data', data => { log += data; });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://127.0.0.1:${controllerPort}/version`)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, log);
    const resolver = new Resolver({ timeout: 1000, tries: 1 });
    resolver.setServers([`127.0.0.1:${dnsPort}`]);
    assert.deepEqual(await resolver.resolve4('shop.real.test'), ['127.0.0.1']);
    assert.ok(queries.includes('shop.real.test'));
    const fake = await resolver.resolve4('proxy.test');
    assert.ok(fake[0].startsWith('198.18.'));
    assert.ok(!queries.includes('proxy.test'), 'Fake-IP answer must not require upstream DNS');
  } finally {
    if (core && core.exitCode === null) { core.kill(); await new Promise(resolve => core.once('exit', resolve)); }
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
