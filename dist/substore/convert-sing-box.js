const __modules = {
  "src/substore/convert-sing-box.js": function(module, exports, __require) {
/*
 * convert-sing-box.js - Sub-Store 文件输出到 sing-box 配置
 *
 * 用法：在 Sub-Store 新建「文件」，脚本指向：
 * https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert-sing-box.js
 *
 * Sub-Store 没有 sing-box 专用类型时，使用「文件」输出本脚本生成的 JSON。
 * 普通文件可用 JSON 作为来源；collection=组合订阅名称 时直接调用后端生成标准 sing-box 节点。
 * Momo 1.13.x：脚本参数 momo=true；需要避开默认端口时再加 mixedPort=7899。
 */

const { buildSingBoxConfig } = __require('src/sing-box/config.js');

const runtimeArgs =
  typeof $arguments === 'object' && $arguments !== null ? $arguments : {};

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'on';
  }
  return false;
}

function parsePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function parseUsers(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('mixedUsers must be a JSON array of username/password objects');
  }
}

function normalizeInput(input) {
  if (typeof input === 'string') return normalizeInput(JSON.parse(input));
  return Array.isArray(input) ? { proxies: input } : input || {};
}

function build(config, options = {}) {
  const args = { ...runtimeArgs, ...options };
  return buildSingBoxConfig(normalizeInput(config), {
    quicEnabled: parseBool(args.quic),
    blockDot: parseBool(args.blockdot),
    momo: parseBool(args.momo),
    apiSecret: typeof args.apiSecret === 'string' ? args.apiSecret : '',
    mixedUsers: parseUsers(args.mixedUsers),
    mixedListen: args.mixedListen,
    mixedPort: parsePort(args.mixedPort, 7890),
    httpPort: parsePort(args.httpPort, 0),
    socksPort: parsePort(args.socksPort, 0)
  });
}

function main(config) {
  return `${JSON.stringify(build(config), null, 2)}\n`;
}

function operator(input) {
  if (input && typeof input === 'object' && ('$content' in input || '$files' in input)) {
    return renderFile(input);
  }
  return main(input);
}

async function renderFile(input) {
  const fileSource = JSON.parse(input.$content || '{}');
  let content = fileSource;
  if (runtimeArgs.collection) {
    if (typeof produceArtifact !== 'function') throw new Error('Sub-Store produceArtifact is unavailable');
    content = JSON.parse(await produceArtifact({ type: 'collection', name: runtimeArgs.collection, platform: 'sing-box' }));
  }
  return { ...input, $content: `${JSON.stringify(build(content, fileSource && fileSource.options || {}), null, 2)}\n` };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    build,
    main,
    operator
  };
}

  },
  "src/sing-box/config.js": function(module, exports, __require) {
const { buildOutbounds, buildPolicyChoices, CORE_OUTBOUND_TAGS } = __require('src/sing-box/outbounds.js');
const { buildRemoteRuleSets } = __require('src/sing-box/rule-sets.js');

const ROUTE_RULES = Object.freeze([
  ['forcedirect', CORE_OUTBOUND_TAGS.directPolicy],
  ['forceproxy', CORE_OUTBOUND_TAGS.forceProxy],
  ['ai', CORE_OUTBOUND_TAGS.ai],
  ['outlook', CORE_OUTBOUND_TAGS.directPolicy],
  ['pt', CORE_OUTBOUND_TAGS.directPolicy],
  ['crypto', '加密货币'],
  ['mining', '加密货币']
]);

const GEOSITE_RULES = Object.freeze([
  ['category-pt', CORE_OUTBOUND_TAGS.directPolicy],
  ['google-play', 'Google'],
  ['youtube@cn', CORE_OUTBOUND_TAGS.directPolicy],
  ['youtube', 'YouTube'],
  ['paypal@cn', CORE_OUTBOUND_TAGS.directPolicy],
  ['paypal', 'PayPal'],
  ['telegram', 'Telegram'],
  ['disney', 'Disney'],
  ['netflix', 'Netflix'],
  ['spotify', 'Spotify'],
  ['twitter', 'Twitter(X)'],
  ['ookla-speedtest', 'Speedtest'],
  ['category-ai-chat-!cn', CORE_OUTBOUND_TAGS.ai],
  ['category-dev', '开发者资源'],
  ['steam@cn', CORE_OUTBOUND_TAGS.directPolicy],
  ['category-games@cn', CORE_OUTBOUND_TAGS.directPolicy],
  ['category-game-platforms-download', '游戏下载'],
  ['category-games', '游戏平台'],
  ['category-scholar-cn', CORE_OUTBOUND_TAGS.directPolicy],
  ['category-scholar-!cn', '学术资源'],
  ['category-cryptocurrency', '加密货币'],
  ['apple@cn', CORE_OUTBOUND_TAGS.directPolicy],
  ['apple', 'Apple'],
  ['microsoft@cn', CORE_OUTBOUND_TAGS.directPolicy],
  ['microsoft', 'Microsoft'],
  ['googlefcm', CORE_OUTBOUND_TAGS.directPolicy],
  ['google', 'Google'],
  ['cn', CORE_OUTBOUND_TAGS.directPolicy],
  ['private', CORE_OUTBOUND_TAGS.directPolicy]
]);

const GEOIP_RULES = Object.freeze([
  ['cn', CORE_OUTBOUND_TAGS.directPolicy]
]);

const RULE_SET_TAGS = Object.freeze([
  'forcedirect',
  'forceproxy',
  'ai',
  'outlook',
  'pt',
  'crypto',
  'mining',
  ...GEOSITE_RULES.map(([tag]) => `geosite-${tag}`),
  ...GEOIP_RULES.map(([tag]) => `geoip-${tag}`)
]);

function buildSingBoxConfig(input = {}, options = {}) {
  const proxies = Array.isArray(input) ? input : input.outbounds || input.proxies;
  const outbounds = buildOutbounds(proxies);

  return {
    log: { level: 'info' },
    dns: buildDnsConfig(options),
    ...(!options.momo && { http_clients: buildHttpClients(outbounds) }),
    inbounds: buildInbounds(options),
    outbounds: addMissingPolicyOutbounds(outbounds),
    route: buildRouteConfig(options),
    experimental: buildExperimentalConfig(options)
  };
}

function buildHttpClients(outbounds) {
  return [
    { tag: 'rule-set-download', detour: outbounds.some(x => x.tag === CORE_OUTBOUND_TAGS.preProxy) ? CORE_OUTBOUND_TAGS.preProxy : CORE_OUTBOUND_TAGS.auto }
  ];
}

function buildExperimentalConfig(options = {}) {
  return {
    cache_file: { enabled: true },
    clash_api: {
      external_controller: options.momo ? '0.0.0.0:19091' : '127.0.0.1:9090',
      ...(options.apiSecret && { secret: options.apiSecret }),
      default_mode: 'Rule',
      access_control_allow_origin: [
        'http://127.0.0.1',
        'http://localhost',
        'http://yacd.haishan.me',
        'https://yacd.metacubex.one'
      ],
      access_control_allow_private_network: true
    }
  };
}

function buildDnsConfig(options = {}) {
  const config = {
    servers: [
      { type: 'udp', tag: 'bootstrap', server: '223.5.5.5' },
      { type: 'https', tag: 'local', server: 'dns.alidns.com', path: '/dns-query', domain_resolver: 'bootstrap' },
      { type: 'tls', tag: 'remote', server: '8.8.8.8', detour: CORE_OUTBOUND_TAGS.proxy },
      { type: 'https', tag: 'google', server: '8.8.8.8', path: '/dns-query', detour: 'Google' }
    ],
    rules: [
      { rule_set: 'geosite-google-play', server: 'google' },
      { rule_set: ['geosite-private', 'geosite-cn'], server: 'local' }
    ],
    final: 'remote',
    strategy: 'ipv4_only'
  };

  if (options.momo) config.reverse_mapping = true;
  if (!options.momo) config.timeout = '5s';
  return config;
}

function buildInbounds(options = {}) {
  const users = options.mixedUsers === undefined ? [] : options.mixedUsers;
  if (!Array.isArray(users) || users.some((user) => !user || typeof user.username !== 'string' || !user.username || typeof user.password !== 'string' || !user.password)) {
    throw new Error('mixedUsers must be an array of nonempty username/password objects');
  }
  if (users.length && (typeof options.mixedListen !== 'string' || !options.mixedListen || ['0.0.0.0', '::', '::0', '127.0.0.1', '::1'].includes(options.mixedListen))) {
    throw new Error('mixedListen must be a specific LAN IP when mixedUsers is configured');
  }
  const listeners = [
    ['mixed', options.mixedPort || 7890],
    ...(options.httpPort ? [['http', options.httpPort]] : []),
    ...(options.socksPort ? [['socks', options.socksPort]] : [])
  ];
  return [
    {
      type: 'tun',
      tag: 'tun-in',
      address: ['172.19.0.1/30'],
      auto_route: !options.momo,
      strict_route: true,
      stack: 'mixed',
      ...(options.momo && { interface_name: 'momo-tun' })
    },
    ...(options.momo ? [{ type: 'direct', tag: 'dns-in', listen: '127.0.0.1', listen_port: 6450 }] : []),
    ...listeners.flatMap(([type, port]) => [
      {
        type,
        tag: `${type}-in`,
        listen: users.length ? options.mixedListen : '0.0.0.0',
        listen_port: port,
        ...(users.length && { users })
      },
      ...(users.length ? [
        { type, tag: `${type}-loopback`, listen: '127.0.0.1', listen_port: port },
        { type, tag: `${type}-loopback-v6`, listen: '::1', listen_port: port }
      ] : [])
    ])
  ];
}

function buildRouteConfig(options = {}) {
  const rules = [
    { action: 'sniff' },
    {
      type: 'logical',
      mode: 'or',
      rules: [{ protocol: 'dns' }, { port: 53 }],
      action: 'hijack-dns'
    }
  ];

  rules.push({ ip_is_private: true, outbound: CORE_OUTBOUND_TAGS.directPolicy });
  rules.push({ rule_set: 'geosite-private', outbound: CORE_OUTBOUND_TAGS.directPolicy });
  if (options.blockDot) rules.push({ port: 853, action: 'reject' });

  function addPolicyRule(rule) {
    if (!options.quicEnabled && rule.outbound !== CORE_OUTBOUND_TAGS.directPolicy) {
      rules.push({ rule_set: rule.rule_set, network: 'udp', port: 443, action: 'reject' });
    }
    rules.push(rule);
  }

  for (const [ruleSet, outbound] of ROUTE_RULES) {
    addPolicyRule({ rule_set: ruleSet, outbound });
  }

  for (const [geosite, outbound] of GEOSITE_RULES) {
    if (geosite !== 'private') addPolicyRule({ rule_set: `geosite-${geosite}`, outbound });
  }

  for (const [geoip, outbound] of GEOIP_RULES) {
    addPolicyRule({ rule_set: `geoip-${geoip}`, outbound });
  }

  if (!options.quicEnabled) rules.push({ network: 'udp', port: 443, action: 'reject' });

  const config = {
    rules,
    rule_set: buildRemoteRuleSets(RULE_SET_TAGS),
    default_domain_resolver: 'bootstrap',
    final: CORE_OUTBOUND_TAGS.proxy,
    auto_detect_interface: true
  };

  if (!options.momo) config.default_http_client = 'rule-set-download';
  return config;
}

function addMissingPolicyOutbounds(outbounds) {
  const existing = new Set(outbounds.map((outbound) => outbound.tag));
  const policies = [
    '加密货币',
    'PayPal',
    'Telegram',
    'Microsoft',
    'Apple',
    'Google',
    'YouTube',
    'Disney',
    'Netflix',
    'Spotify',
    'Twitter(X)',
    '学术资源',
    '开发者资源',
    '游戏下载',
    '游戏平台',
    'Speedtest'
  ];

  const policyChoices = buildPolicyChoices(getStaticPolicyTags(outbounds));
  const additions = policies
    .filter((tag) => !existing.has(tag))
    .map((tag) => ({
      type: 'selector',
      tag,
      outbounds: policyChoices
    }));

  return [...outbounds, ...additions];
}

function getStaticPolicyTags(outbounds) {
  const selector = outbounds.find((outbound) => outbound.tag === CORE_OUTBOUND_TAGS.proxy);
  return Array.isArray(selector && selector.outbounds)
    ? selector.outbounds.filter((tag) => ![
        CORE_OUTBOUND_TAGS.auto,
        CORE_OUTBOUND_TAGS.manual,
        CORE_OUTBOUND_TAGS.direct
      ].includes(tag))
    : [];
}

module.exports = {
  GEOIP_RULES,
  GEOSITE_RULES,
  ROUTE_RULES,
  RULE_SET_TAGS,
  buildDnsConfig,
  buildExperimentalConfig,
  buildInbounds,
  buildRouteConfig,
  buildSingBoxConfig
};

  },
  "src/sing-box/outbounds.js": function(module, exports, __require) {
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

  },
  "src/sing-box/rule-sets.js": function(module, exports, __require) {
const REMOTE_RULE_SET_BASE = 'https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/sing-box';
const REMOTE_GEOSITE_BASE = 'https://raw.githubusercontent.com/appshubcc/bett-rules/sing/geo/geosite';
const REMOTE_GEOIP_BASE = 'https://raw.githubusercontent.com/appshubcc/bett-rules/sing/geo/geoip';

function ruleSetTagFromFile(fileName) {
  return fileName.replace(/\.ya?ml$/i, '');
}

function splitDomainPayload(payload) {
  const domain = [];
  const domainSuffix = [];

  for (const item of payload) {
    if (typeof item !== 'string') continue;
    const value = item.trim();
    if (!value) continue;

    if (value.startsWith('+.')) {
      const root = value.slice(2);
      domain.push(root);
      domainSuffix.push(`.${root}`);
      continue;
    }

    domain.push(value);
  }

  return { domain, domainSuffix };
}

function buildSourceRuleSet(payload) {
  const { domain, domainSuffix } = splitDomainPayload(payload);
  const rule = {};

  if (domain.length) rule.domain = domain;
  if (domainSuffix.length) rule.domain_suffix = domainSuffix;

  return {
    version: 3,
    rules: Object.keys(rule).length ? [rule] : []
  };
}

function buildRemoteRuleSets(tags) {
  return tags.map((tag) => {
    const geosite = tag.startsWith('geosite-');
    const geoip = tag.startsWith('geoip-');
    const assetName = geosite
      ? tag.slice('geosite-'.length)
      : geoip
        ? tag.slice('geoip-'.length)
        : tag;

    return {
      type: 'remote',
      tag,
      format: geosite || geoip ? 'binary' : 'source',
      url: geosite
        ? `${REMOTE_GEOSITE_BASE}/${assetName}.srs`
        : geoip
          ? `${REMOTE_GEOIP_BASE}/${assetName}.srs`
          : `${REMOTE_RULE_SET_BASE}/${tag}.json`,
      update_interval: '24h'
    };
  });
}

module.exports = {
  REMOTE_GEOIP_BASE,
  REMOTE_GEOSITE_BASE,
  REMOTE_RULE_SET_BASE,
  buildRemoteRuleSets,
  buildSourceRuleSet,
  ruleSetTagFromFile,
  splitDomainPayload
};

  }
};
const __cache = {};
function __require(id) {
  if (!__modules[id]) throw new Error(`Missing bundled module: ${id}`);
  if (!__cache[id]) {
    const module = { exports: {} };
    __modules[id](module, module.exports, __require);
    __cache[id] = module;
  }
  return __cache[id].exports;
}
const __entry = __require("src/substore/convert-sing-box.js");
function build(config) {
  return __entry.build(config);
}
function main(config) {
  return __entry.main(config);
}
function operator(proxies) {
  return __entry.operator(proxies);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = __entry;
}
