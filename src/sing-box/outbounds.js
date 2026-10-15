const CORE_OUTBOUND_TAGS = Object.freeze({
  proxy: '节点选择',
  auto: '自动选择',
  manual: '手动切换',
  landing: '落地节点',
  preProxy: '前置代理',
  relay: '中转节点',
  ix: 'IX节点',
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

const LOW_COST_RE = /0\.[0-5]|低倍率|省流|大流量|实验性/i;
const IX_RE = /\bIX\b|\bAKCDN\b/i;

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

function hasUnsupportedCertificatePin(proxy) {
  const pin = proxy && proxy.tls && proxy.tls.certificate_sha256;
  return Boolean(Array.isArray(pin) ? pin.length : pin);
}

function normalizeProxy(proxy) {
  const tag = proxy && (proxy.tag || proxy.name);
  if (!proxy || typeof proxy !== 'object' || !tag || !proxy.type) return null;
  // Certificate fingerprints cannot be substituted for official sing-box public-key pins.
  if (hasUnsupportedCertificatePin(proxy)) return null;

  if (proxy.tag && proxy.server && proxy.server_port) {
    const outbound = { ...proxy, type: TYPE_MAP[String(proxy.type).toLowerCase()] || proxy.type, tag };
    if (!outbound.detour && proxy['dialer-proxy']) outbound.detour = proxy['dialer-proxy'];
    delete outbound.name;
    delete outbound['dialer-proxy'];
    return outbound;
  }

  const type = TYPE_MAP[String(proxy.type).toLowerCase()];
  if (!type) return null;

  if (type === 'direct') {
    return { type: 'direct', tag };
  }

  const outbound = { type, tag };
  if (proxy.detour || proxy['dialer-proxy']) outbound.detour = proxy.detour || proxy['dialer-proxy'];

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
  const excludedPins = asArray(proxies).filter(hasUnsupportedCertificatePin).length;
  if (excludedPins) {
    console.warn(`[sing-box] Excluded ${excludedPins} nodes: tls.certificate_sha256 is unsupported by official sing-box; certificate pins were not removed or converted.`);
  }
  const proxyOutbounds = asArray(proxies).map(normalizeProxy).filter(Boolean);
  const landingTags = proxyOutbounds.filter((outbound) => outbound.detour).map((outbound) => outbound.tag);
  const hasLanding = landingTags.length > 0;
  const proxyTags = proxyOutbounds
    .filter((outbound) => !hasLanding || (!outbound.detour && !/落地/.test(outbound.tag) && !IX_RE.test(outbound.tag)))
    .map((outbound) => outbound.tag);
  if (hasLanding && !proxyTags.length) throw new Error('No independent nodes available for 前置代理');
  const selectableTags = proxyTags.length ? proxyTags : [CORE_OUTBOUND_TAGS.direct];
  const staticGroups = buildStaticGroups(proxyTags);
  const staticGroupTags = staticGroups.map((group) => group.tag);
  const landingGroups = [];
  if (hasLanding) {
    const ixTags = proxyOutbounds.filter((outbound) => IX_RE.test(outbound.tag)).map((outbound) => outbound.tag);
    landingGroups.push(
      { type: 'selector', tag: CORE_OUTBOUND_TAGS.landing, outbounds: landingTags, default: landingTags[0] },
      buildUrlTestGroup(CORE_OUTBOUND_TAGS.relay, proxyTags),
      {
        type: 'selector',
        tag: CORE_OUTBOUND_TAGS.preProxy,
        outbounds: [CORE_OUTBOUND_TAGS.relay, ...staticGroupTags, CORE_OUTBOUND_TAGS.manual],
        default: CORE_OUTBOUND_TAGS.relay
      }
    );
    if (ixTags.length) landingGroups.push({ type: 'selector', tag: CORE_OUTBOUND_TAGS.ix, outbounds: ixTags });
    for (const group of landingGroups) {
      if (proxyOutbounds.some((outbound) => outbound.tag === group.tag)) {
        throw new Error(`Proxy tag conflicts with generated group: ${group.tag}`);
      }
    }
  }
  const landingChoices = landingGroups.filter((group) => [CORE_OUTBOUND_TAGS.landing, CORE_OUTBOUND_TAGS.ix].includes(group.tag)).map((group) => group.tag);
  const nodeSelectionChoices = [
    ...landingChoices,
    CORE_OUTBOUND_TAGS.auto,
    CORE_OUTBOUND_TAGS.manual,
    ...staticGroupTags,
    CORE_OUTBOUND_TAGS.direct
  ];
  const policyChoices = buildPolicyChoices([...landingChoices, ...staticGroupTags]);

  return [
    { type: 'direct', tag: CORE_OUTBOUND_TAGS.direct },
    { type: 'block', tag: CORE_OUTBOUND_TAGS.block },
    ...proxyOutbounds,
    {
      type: 'selector',
      tag: CORE_OUTBOUND_TAGS.directPolicy,
      outbounds: [CORE_OUTBOUND_TAGS.direct]
    },
    ...staticGroups,
    ...landingGroups,
    {
      type: 'selector',
      tag: CORE_OUTBOUND_TAGS.proxy,
      outbounds: nodeSelectionChoices,
      ...(hasLanding ? { default: CORE_OUTBOUND_TAGS.landing } : {})
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
      outbounds: policyChoices
    },
    {
      type: 'selector',
      tag: CORE_OUTBOUND_TAGS.ai,
      outbounds: policyChoices
    }
  ];
}

function buildPolicyChoices(staticGroupTags) {
  return [
    CORE_OUTBOUND_TAGS.proxy,
    ...staticGroupTags,
    CORE_OUTBOUND_TAGS.auto,
    CORE_OUTBOUND_TAGS.manual,
    CORE_OUTBOUND_TAGS.direct
  ];
}

function buildStaticGroups(proxyTags) {
  const groups = [];
  for (const [country, regex] of COUNTRY_MATCHERS) {
    const outbounds = proxyTags.filter((tag) => regex.test(tag));
    if (outbounds.length) groups.push(buildUrlTestGroup(`${country}节点`, outbounds));
  }

  const lowCost = proxyTags.filter((tag) => LOW_COST_RE.test(tag));
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
  buildPolicyChoices,
  buildStaticGroups,
  normalizeProxy
};
