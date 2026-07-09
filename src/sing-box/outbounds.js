const CORE_OUTBOUND_TAGS = Object.freeze({
  proxy: '节点选择',
  auto: '自动选择',
  manual: '手动切换',
  ai: '人工智能',
  forceProxy: '强制代理',
  directPolicy: '全球直连',
  direct: 'direct',
  block: 'block'
});

const COUNTRY_MATCHERS = Object.freeze([
  ['香港', /香港|港|\bHK\b|Hong\s*Kong/i],
  ['澳门', /澳门|\bMO\b|Macau/i],
  ['台湾', /台|新北|彰化|\bTW\b|Taiwan/i],
  ['新加坡', /新加坡|坡|狮城|\bSG\b|Singapore/i],
  ['日本', /日本|川日|东京|大阪|泉日|埼玉|沪日|深日|\bJP\b|Japan/i],
  ['韩国', /\bKR\b|Korea|\bKOR\b|首尔|韩|韓/i],
  ['美国', /美国|美|\bUS\b|United\s*States/i],
  ['加拿大', /加拿大|Canada|\bCA\b/i],
  ['英国', /英国|United\s*Kingdom|\bUK\b|伦敦|London/i],
  ['澳大利亚', /澳洲|澳大利亚|\bAU\b|Australia/i],
  ['德国', /德国|德|\bDE\b|Germany/i],
  ['法国', /法国|法|\bFR\b|France/i],
  ['俄罗斯', /俄罗斯|俄|\bRU\b|Russia/i],
  ['泰国', /泰国|泰|\bTH\b|Thailand/i],
  ['印度', /印度|\bIN\b|India/i],
  ['马来西亚', /马来西亚|马来|\bMY\b|Malaysia/i]
]);

const LANDING_RE = /家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地/i;
const LOW_COST_RE = /0\.[0-5]|低倍率|省流|大流量|实验性/i;

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
  const staticGroups = buildStaticGroups(proxyTags);
  const staticGroupTags = staticGroups.map((group) => group.tag);
  const policyChoices = [
    CORE_OUTBOUND_TAGS.auto,
    CORE_OUTBOUND_TAGS.manual,
    ...staticGroupTags,
    CORE_OUTBOUND_TAGS.directPolicy
  ];

  return [
    { type: 'direct', tag: CORE_OUTBOUND_TAGS.direct },
    { type: 'block', tag: CORE_OUTBOUND_TAGS.block },
    ...proxyOutbounds,
    {
      type: 'selector',
      tag: CORE_OUTBOUND_TAGS.directPolicy,
      outbounds: [CORE_OUTBOUND_TAGS.direct, CORE_OUTBOUND_TAGS.proxy]
    },
    ...staticGroups,
    {
      type: 'selector',
      tag: CORE_OUTBOUND_TAGS.proxy,
      outbounds: policyChoices
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
      tag: CORE_OUTBOUND_TAGS.forceProxy,
      outbounds: [CORE_OUTBOUND_TAGS.proxy, CORE_OUTBOUND_TAGS.manual, CORE_OUTBOUND_TAGS.directPolicy]
    },
    {
      type: 'selector',
      tag: CORE_OUTBOUND_TAGS.ai,
      outbounds: [CORE_OUTBOUND_TAGS.proxy, CORE_OUTBOUND_TAGS.auto, CORE_OUTBOUND_TAGS.manual, CORE_OUTBOUND_TAGS.directPolicy]
    }
  ];
}

function buildStaticGroups(proxyTags) {
  const groups = [];
  for (const [country, regex] of COUNTRY_MATCHERS) {
    const outbounds = proxyTags.filter((tag) => !LANDING_RE.test(tag) && regex.test(tag));
    if (outbounds.length) groups.push(buildUrlTestGroup(`${country}节点`, outbounds));
  }

  const lowCost = proxyTags.filter((tag) => !LANDING_RE.test(tag) && LOW_COST_RE.test(tag));
  if (lowCost.length) groups.push(buildUrlTestGroup('低倍率节点', lowCost));

  return groups;
}

function buildUrlTestGroup(tag, outbounds) {
  return {
    type: 'urltest',
    tag,
    outbounds,
    url: 'https://www.gstatic.com/generate_204',
    interval: '5m'
  };
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
  buildStaticGroups,
  normalizeProxy
};
