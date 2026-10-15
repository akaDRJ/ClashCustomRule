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
      external_controller: options.momo ? '0.0.0.0:19091' : options.openwrt && options.apiSecret ? '0.0.0.0:9090' : '127.0.0.1:9090',
      ...(options.apiSecret && { secret: options.apiSecret }),
      ...(options.openwrt && { external_ui: '/usr/share/sing-box/ui' }),
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

  if (options.openwrt) {
    config.servers[0] = {
      type: 'https', tag: 'bootstrap', server: '223.5.5.5', path: '/dns-query',
      tls: { enabled: true, server_name: 'dns.alidns.com' }
    };
    config.rules.splice(1, 0, { rule_set: ['forcedirect', 'outlook', 'pt'], server: 'local' });
  }
  if (options.momo || options.openwrt) config.reverse_mapping = true;
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
      address: options.openwrt ? ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'] : ['172.19.0.1/30'],
      auto_route: !options.momo,
      strict_route: true,
      stack: 'mixed',
      ...(options.openwrt && { interface_name: 'sing-box-tun', auto_redirect: true, dns_mode: 'hijack' }),
      ...(options.momo && { interface_name: 'momo-tun' })
    },
    ...(options.momo || options.openwrt ? [{ type: 'direct', tag: 'dns-in', listen: '127.0.0.1', listen_port: 6450 }] : []),
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
