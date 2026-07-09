const { buildOutbounds, buildPolicyChoices, CORE_OUTBOUND_TAGS } = require('./outbounds');
const { buildRemoteRuleSets } = require('./rule-sets');

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
  ['google-play@cn', CORE_OUTBOUND_TAGS.directPolicy],
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
  ['category-dev', '开发者资源'],
  ['category-ai-chat-!cn', CORE_OUTBOUND_TAGS.ai],
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
  const proxies = Array.isArray(input) ? input : input.proxies;
  const outbounds = buildOutbounds(proxies);

  return {
    log: { level: 'info' },
    dns: buildDnsConfig(),
    http_clients: buildHttpClients(),
    inbounds: buildInbounds(),
    outbounds: addMissingPolicyOutbounds(outbounds),
    route: buildRouteConfig(options),
    experimental: buildExperimentalConfig()
  };
}

function buildHttpClients() {
  return [
    { tag: 'rule-set-download' }
  ];
}

function buildExperimentalConfig() {
  return {
    cache_file: { enabled: true },
    clash_api: {
      external_controller: '127.0.0.1:9090',
      default_mode: 'Rule'
    }
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
      type: 'tun',
      tag: 'tun-in',
      address: ['172.19.0.1/30'],
      auto_route: true,
      stack: 'mixed'
    },
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

  rules.push({ ip_is_private: true, outbound: CORE_OUTBOUND_TAGS.directPolicy });

  return {
    rules,
    rule_set: buildRemoteRuleSets(RULE_SET_TAGS),
    default_domain_resolver: 'bootstrap',
    default_http_client: 'rule-set-download',
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
