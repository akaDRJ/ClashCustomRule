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
  ['netflix', 'Netflix'],
  ['google', 'Google'],
  ['telegram', 'Telegram'],
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
