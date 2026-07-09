const __modules = {
  "src/substore/convert-sing-box.js": function(module, exports, __require) {
/*
 * convert-sing-box.js - Sub-Store 文件输出到 sing-box 配置
 *
 * 用法：在 Sub-Store 新建「文件」，脚本指向：
 * https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert-sing-box.js
 *
 * Sub-Store 没有 sing-box 专用类型时，使用「文件」输出本脚本生成的 JSON。
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

function normalizeInput(input) {
  return Array.isArray(input) ? { proxies: input } : input || {};
}

function build(config) {
  return buildSingBoxConfig(normalizeInput(config), {
    quicEnabled: parseBool(runtimeArgs.quic)
  });
}

function main(config) {
  return `${JSON.stringify(build(config), null, 2)}\n`;
}

function operator(input) {
  return main(input);
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
const { buildOutbounds, CORE_OUTBOUND_TAGS } = __require('src/sing-box/outbounds.js');
const { buildRemoteRuleSets } = __require('src/sing-box/rule-sets.js');

const ROUTE_RULES = Object.freeze([
  ['forcedirect', CORE_OUTBOUND_TAGS.direct],
  ['forceproxy', CORE_OUTBOUND_TAGS.proxy],
  ['ai', CORE_OUTBOUND_TAGS.ai],
  ['outlook', CORE_OUTBOUND_TAGS.direct],
  ['pt', CORE_OUTBOUND_TAGS.direct],
  ['crypto', '加密货币'],
  ['mining', '加密货币']
]);

const GEOSITE_RULES = Object.freeze([
  ['category-pt', CORE_OUTBOUND_TAGS.direct],
  ['google-play@cn', CORE_OUTBOUND_TAGS.direct],
  ['youtube@cn', CORE_OUTBOUND_TAGS.direct],
  ['youtube', 'YouTube'],
  ['paypal@cn', CORE_OUTBOUND_TAGS.direct],
  ['paypal', 'PayPal'],
  ['telegram', 'Telegram'],
  ['disney', 'Disney'],
  ['netflix', 'Netflix'],
  ['spotify', 'Spotify'],
  ['twitter', 'Twitter(X)'],
  ['ookla-speedtest', 'Speedtest'],
  ['category-dev', '开发者资源'],
  ['category-ai-chat-!cn', CORE_OUTBOUND_TAGS.ai],
  ['steam@cn', CORE_OUTBOUND_TAGS.direct],
  ['category-games@cn', CORE_OUTBOUND_TAGS.direct],
  ['category-game-platforms-download', '游戏下载'],
  ['category-games', '游戏平台'],
  ['category-scholar-cn', CORE_OUTBOUND_TAGS.direct],
  ['category-scholar-!cn', '学术资源'],
  ['category-cryptocurrency', '加密货币'],
  ['apple@cn', CORE_OUTBOUND_TAGS.direct],
  ['apple', 'Apple'],
  ['microsoft@cn', CORE_OUTBOUND_TAGS.direct],
  ['microsoft', 'Microsoft'],
  ['googlefcm', CORE_OUTBOUND_TAGS.direct],
  ['google', 'Google'],
  ['cn', CORE_OUTBOUND_TAGS.direct],
  ['private', CORE_OUTBOUND_TAGS.direct]
]);

const GEOIP_RULES = Object.freeze([
  ['cn', CORE_OUTBOUND_TAGS.direct]
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
  const proxies = Array.isArray(input) ? input : input.proxies;
  const outbounds = buildOutbounds(proxies);

  return {
    log: { level: 'info' },
    dns: buildDnsConfig(),
    inbounds: buildInbounds(),
    outbounds: addMissingPolicyOutbounds(outbounds),
    route: buildRouteConfig(options),
    experimental: { cache_file: { enabled: true } }
  };
}

function buildDnsConfig() {
  return {
    servers: [
      { type: 'udp', tag: 'bootstrap', server: '223.5.5.5' },
      { type: 'https', tag: 'alidns', server: 'dns.alidns.com', path: '/dns-query', domain_resolver: 'bootstrap' },
      { type: 'https', tag: 'dnspod', server: 'doh.pub', path: '/dns-query', domain_resolver: 'bootstrap' }
    ],
    final: 'alidns',
    strategy: 'ipv4_only'
  };
}

function buildInbounds() {
  return [
    {
      type: 'mixed',
      tag: 'mixed-in',
      listen: '0.0.0.0',
      listen_port: 7890
    }
  ];
}

function buildRouteConfig(options = {}) {
  const rules = [];

  if (!options.quicEnabled) {
    rules.push({ network: 'udp', port: 443, action: 'reject' });
  }

  for (const [ruleSet, outbound] of ROUTE_RULES) {
    rules.push({ rule_set: ruleSet, outbound });
  }

  for (const [geosite, outbound] of GEOSITE_RULES) {
    rules.push({ rule_set: `geosite-${geosite}`, outbound });
  }

  for (const [geoip, outbound] of GEOIP_RULES) {
    rules.push({ rule_set: `geoip-${geoip}`, outbound });
  }

  rules.push({ ip_is_private: true, outbound: CORE_OUTBOUND_TAGS.direct });

  return {
    rules,
    rule_set: buildRemoteRuleSets(RULE_SET_TAGS),
    default_domain_resolver: 'bootstrap',
    final: CORE_OUTBOUND_TAGS.proxy,
    auto_detect_interface: true
  };
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

  const additions = policies
    .filter((tag) => !existing.has(tag))
    .map((tag) => ({
      type: 'selector',
      tag,
      outbounds: [CORE_OUTBOUND_TAGS.proxy, CORE_OUTBOUND_TAGS.auto, CORE_OUTBOUND_TAGS.manual, CORE_OUTBOUND_TAGS.direct]
    }));

  return [...outbounds, ...additions];
}

module.exports = {
  GEOIP_RULES,
  GEOSITE_RULES,
  ROUTE_RULES,
  RULE_SET_TAGS,
  buildDnsConfig,
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

  },
  "src/sing-box/rule-sets.js": function(module, exports, __require) {
const REMOTE_RULE_SET_BASE = 'https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/sing-box';
const REMOTE_GEOSITE_BASE = 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set';
const REMOTE_GEOIP_BASE = 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set';

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

    return {
      type: 'remote',
      tag,
      format: geosite || geoip ? 'binary' : 'source',
      url: geosite
        ? `${REMOTE_GEOSITE_BASE}/${tag}.srs`
        : geoip
          ? `${REMOTE_GEOIP_BASE}/${tag}.srs`
          : `${REMOTE_RULE_SET_BASE}/${tag}.json`,
      download_detour: 'direct',
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
