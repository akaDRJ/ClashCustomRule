const CORE_OUTBOUND_TAGS = Object.freeze({
  proxy: '节点选择',
  auto: '自动选择',
  manual: '手动切换',
  ai: '人工智能',
  direct: 'direct',
  block: 'block'
});

const TYPE_MAP = Object.freeze({
  ss: 'shadowsocks',
  shadowsocks: 'shadowsocks',
  trojan: 'trojan',
  vmess: 'vmess',
  vless: 'vless',
  hysteria2: 'hysteria2',
  hy2: 'hysteria2',
  hysteria: 'hysteria',
  tuic: 'tuic',
  anytls: 'anytls',
  wireguard: 'wireguard',
  direct: 'direct'
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeProxy(proxy) {
  if (!proxy || typeof proxy !== 'object' || !proxy.name || !proxy.type) return null;

  const type = TYPE_MAP[String(proxy.type).toLowerCase()];
  if (!type) return null;

  if (type === 'direct') {
    return { type: 'direct', tag: proxy.name };
  }

  const outbound = { type, tag: proxy.name };

  copy(proxy, outbound, 'server');
  copyPort(proxy, outbound);
  copy(proxy, outbound, 'password');
  copy(proxy, outbound, 'uuid');
  copy(proxy, outbound, 'username');
  copy(proxy, outbound, 'private_key');
  copy(proxy, outbound, 'peer_public_key');
  copy(proxy, outbound, 'reserved');
  copy(proxy, outbound, 'local_address');
  copy(proxy, outbound, 'server_name');

  if (proxy.cipher) outbound.method = proxy.cipher;
  if (proxy.sni || proxy.servername || proxy['server-name']) {
    outbound.tls = { enabled: true, server_name: proxy.sni || proxy.servername || proxy['server-name'] };
  } else if (proxy.tls === true || proxy.tls === 'true' || type === 'anytls') {
    outbound.tls = { enabled: true };
  }

  if (outbound.tls && (proxy['skip-cert-verify'] === true || proxy['skip-cert-verify'] === 'true')) {
    outbound.tls.insecure = true;
  }

  return outbound.server && outbound.server_port ? outbound : null;
}

function buildOutbounds(proxies) {
  const proxyOutbounds = asArray(proxies).map(normalizeProxy).filter(Boolean);
  const proxyTags = proxyOutbounds.map((outbound) => outbound.tag);
  const selectableTags = proxyTags.length ? proxyTags : [CORE_OUTBOUND_TAGS.direct];

  return [
    { type: 'direct', tag: CORE_OUTBOUND_TAGS.direct },
    { type: 'block', tag: CORE_OUTBOUND_TAGS.block },
    ...proxyOutbounds,
    {
      type: 'selector',
      tag: CORE_OUTBOUND_TAGS.proxy,
      outbounds: [CORE_OUTBOUND_TAGS.auto, CORE_OUTBOUND_TAGS.manual, CORE_OUTBOUND_TAGS.direct]
    },
    {
      type: 'urltest',
      tag: CORE_OUTBOUND_TAGS.auto,
      outbounds: selectableTags,
      url: 'https://www.gstatic.com/generate_204',
      interval: '5m'
    },
    {
      type: 'selector',
      tag: CORE_OUTBOUND_TAGS.manual,
      outbounds: selectableTags
    },
    {
      type: 'selector',
      tag: CORE_OUTBOUND_TAGS.ai,
      outbounds: [CORE_OUTBOUND_TAGS.proxy, CORE_OUTBOUND_TAGS.auto, CORE_OUTBOUND_TAGS.manual, CORE_OUTBOUND_TAGS.direct]
    }
  ];
}

function copy(from, to, key) {
  if (from[key] !== undefined && from[key] !== '') to[key] = from[key];
}

function copyPort(from, to) {
  const port = Number(from.port || from.server_port || from['server-port']);
  if (Number.isInteger(port) && port > 0) to.server_port = port;
}

module.exports = {
  CORE_OUTBOUND_TAGS,
  buildOutbounds,
  normalizeProxy
};
