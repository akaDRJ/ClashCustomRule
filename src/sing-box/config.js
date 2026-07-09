const { buildOutbounds, CORE_OUTBOUND_TAGS } = require('./outbounds');
const { buildRemoteRuleSets } = require('./rule-sets');

const ROUTE_RULES = Object.freeze([
  ['forcedirect', CORE_OUTBOUND_TAGS.direct],
  ['forceproxy', CORE_OUTBOUND_TAGS.proxy],
  ['ai', CORE_OUTBOUND_TAGS.ai],
  ['outlook', CORE_OUTBOUND_TAGS.direct],
  ['pt', CORE_OUTBOUND_TAGS.direct],
  ['crypto', '加密货币'],
  ['mining', '加密货币']
]);

const RULE_SET_TAGS = Object.freeze([
  'forcedirect',
  'forceproxy',
  'ai',
  'outlook',
  'pt',
  'crypto',
  'mining'
]);

function buildSingBoxConfig(input = {}, options = {}) {
  const proxies = Array.isArray(input) ? input : input.proxies;
  const outbounds = buildOutbounds(proxies);

  return {
    log: { level: 'info' },
    dns: buildDnsConfig(),
    inbounds: buildInbounds(),
    outbounds: addMissingPolicyOutbounds(outbounds),
    route: buildRouteConfig(options)
  };
}

function buildDnsConfig() {
  return {
    servers: [
      { type: 'https', tag: 'alidns', server: 'dns.alidns.com', path: '/dns-query' },
      { type: 'https', tag: 'dnspod', server: 'doh.pub', path: '/dns-query' }
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

  rules.push(
    { geosite: 'category-pt', outbound: CORE_OUTBOUND_TAGS.direct },
    { geosite: 'google-play@cn', outbound: CORE_OUTBOUND_TAGS.direct },
    { geosite: 'youtube@cn', outbound: CORE_OUTBOUND_TAGS.direct },
    { geosite: 'youtube', outbound: 'YouTube' },
    { geosite: 'paypal@cn', outbound: CORE_OUTBOUND_TAGS.direct },
    { geosite: 'paypal', outbound: 'PayPal' },
    { geosite: 'telegram', outbound: 'Telegram' },
    { geosite: 'disney', outbound: 'Disney' },
    { geosite: 'netflix', outbound: 'Netflix' },
    { geosite: 'spotify', outbound: 'Spotify' },
    { geosite: 'twitter', outbound: 'Twitter(X)' },
    { geosite: 'ookla-speedtest', outbound: 'Speedtest' },
    { geosite: 'category-dev', outbound: '开发者资源' },
    { geosite: 'category-ai-chat-!cn', outbound: CORE_OUTBOUND_TAGS.ai },
    { geosite: 'steam@cn', outbound: CORE_OUTBOUND_TAGS.direct },
    { geosite: 'category-games@cn', outbound: CORE_OUTBOUND_TAGS.direct },
    { geosite: 'category-game-platforms-download', outbound: '游戏下载' },
    { geosite: 'category-games', outbound: '游戏平台' },
    { geosite: 'category-scholar-cn', outbound: CORE_OUTBOUND_TAGS.direct },
    { geosite: 'category-scholar-!cn', outbound: '学术资源' },
    { geosite: 'category-cryptocurrency', outbound: '加密货币' },
    { geosite: 'apple@cn', outbound: CORE_OUTBOUND_TAGS.direct },
    { geosite: 'apple', outbound: 'Apple' },
    { geosite: 'microsoft@cn', outbound: CORE_OUTBOUND_TAGS.direct },
    { geosite: 'microsoft', outbound: 'Microsoft' },
    { geosite: 'googlefcm', outbound: CORE_OUTBOUND_TAGS.direct },
    { geosite: 'google', outbound: 'Google' },
    { geosite: 'cn', outbound: CORE_OUTBOUND_TAGS.direct },
    { geosite: 'private', outbound: CORE_OUTBOUND_TAGS.direct },
    { geoip: 'netflix', outbound: 'Netflix' },
    { geoip: 'google', outbound: 'Google' },
    { geoip: 'telegram', outbound: 'Telegram' },
    { geoip: 'cn', outbound: CORE_OUTBOUND_TAGS.direct },
    { geoip: 'private', outbound: CORE_OUTBOUND_TAGS.direct }
  );

  return {
    rules,
    rule_set: buildRemoteRuleSets(RULE_SET_TAGS),
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
  ROUTE_RULES,
  RULE_SET_TAGS,
  buildDnsConfig,
  buildInbounds,
  buildRouteConfig,
  buildSingBoxConfig
};
