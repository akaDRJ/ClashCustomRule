/*
powerfullz 的 Substore 订阅转换脚本（无智能兜底版）
要点：
- 去掉“智能低倍率兜底”功能，不做任何回填
- 国家组恒定仅排除家宽/落地等 ISP 关键词
- 规则关键字与集合标识统一小写；第三段保留策略组名大小写
- 克隆基础数组避免多次运行污染；统一 ICON/Geo 源；正则工具化
- 支持 `regex` 参数：`false` 列举节点名，`true` 运行时正则筛选
*/

// ======================== 运行参数 ========================
const runtimeArgs =
  typeof $arguments === 'object' && $arguments !== null ? $arguments : {};

const options = Object.freeze({
  loadBalance: parseBool(runtimeArgs.loadbalance),
  landing: parseBool(runtimeArgs.landing),
  ipv6Enabled: parseBool(runtimeArgs.ipv6),
  fullConfig: parseBool(runtimeArgs.full),
  enableKeepAlive: parseBool(runtimeArgs.keepalive),
  quicEnabled: parseBool(runtimeArgs.quic),
  regexFilter: parseBool(runtimeArgs.regex)
});

// ==================== 基础数组（只读基线） ====================
const defaultProxiesBase = Object.freeze([
  '节点选择',
  '自动选择',
  '手动切换',
  '全球直连'
]);

const defaultProxiesDirectBase = Object.freeze([
  '全球直连',
  '节点选择',
  '手动切换'
]);

const defaultSelectorBase = Object.freeze(['自动选择', '手动切换', 'DIRECT']);

const globalProxiesBase = Object.freeze([
  '节点选择',
  '手动切换',
  '自动选择',
  '强制代理',
  '静态资源',
  '人工智能',
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
  'Speedtest',
  '全球直连'
]);

// ============== 规则（第一二段小写，第三段保留） ==============
const rules = [
  'rule-set,forcedirect,全球直连',
  'rule-set,forceproxy,强制代理',
  'rule-set,outlook,全球直连',
  'rule-set,cdn,静态资源',
  'rule-set,pt,全球直连',
  'geosite,category-pt,全球直连',
  'geosite,google-play@cn,全球直连',
  'geosite,youtube@cn,全球直连',
  'geosite,youtube,YouTube',
  'geosite,paypal@cn,全球直连',
  'geosite,paypal,PayPal',
  'geosite,telegram,Telegram',
  'geosite,disney,Disney',
  'geosite,netflix,Netflix',
  'geosite,spotify,Spotify',
  'geosite,twitter,Twitter(X)',
  'geosite,ookla-speedtest,Speedtest',
  'geosite,category-dev,开发者资源',
  'geosite,category-ai-chat-!cn,人工智能',
  'geosite,steam@cn,全球直连',
  'geosite,category-games@cn,全球直连',
  'geosite,category-game-platforms-download,游戏下载',
  'geosite,category-games,游戏平台',
  'geosite,category-scholar-cn,全球直连',
  'geosite,category-scholar-!cn,学术资源',
  'rule-set,crypto,加密货币',
  'rule-set,mining,加密货币',
  'geosite,category-cryptocurrency,加密货币',
  'geosite,apple@cn,全球直连',
  'geosite,apple,Apple',
  'geosite,microsoft@cn,全球直连',
  'geosite,microsoft,Microsoft',
  'geosite,google,Google',
  'geosite,cn,全球直连',
  'rule-set,cnsite,全球直连',
  'geosite,private,全球直连',

  'geoip,netflix,Netflix,no-resolve',
  'geoip,google,Google,no-resolve',
  'geoip,telegram,Telegram,no-resolve',
  'geoip,cn,全球直连,no-resolve',
  'geoip,private,全球直连,no-resolve',
  'match,节点选择'
];

function buildRules(quicEnabled) {
  const ruleList = [...rules];
  if (!quicEnabled) {
    ruleList.unshift('AND,((DST-PORT,443),(NETWORK,UDP)),REJECT');
  }
  return ruleList;
}

// ======================= 统一资源与图标 =======================
const CDN = 'https://gcore.jsdelivr.net';
const ICON = (path) => `${CDN}/gh/Koolson/Qure@master/IconSet/Color/${path}`;

// ================= rule-providers（工厂） =================
function yamlProvider(name, repoPath) {
  return {
    type: 'http',
    behavior: 'domain',
    format: 'yaml',
    interval: 86400,
    url: `https://raw.githubusercontent.com/${repoPath}`,
    path: `./ruleset/${name}.yaml`
  };
}

function mrsProvider(name, hostPath) {
  return {
    type: 'http',
    behavior: 'domain',
    format: 'mrs',
    interval: 86400,
    url: `https://${hostPath}`,
    path: `./ruleset/${name}.mrs`
  };
}

function textProvider(name, hostPath) {
  return {
    type: 'http',
    behavior: 'classical',
    format: 'text',
    interval: 86400,
    url: `https://${hostPath}`,
    path: `./ruleset/${name}.txt`
  };
}

const ruleProviders = {
  outlook: yamlProvider('outlook', 'akaDRJ/ClashCustomRule/master/outlook.yaml'),
  pt: yamlProvider('pt', 'akaDRJ/ClashCustomRule/master/pt.yaml'),
  crypto: yamlProvider('crypto', 'akaDRJ/ClashCustomRule/master/crypto.yaml'),
  mining: yamlProvider('mining', 'akaDRJ/ClashCustomRule/master/mining.yaml'),
  forceproxy: yamlProvider(
    'forceproxy',
    'akaDRJ/ClashCustomRule/master/forceproxy.yaml'
  ),
  forcedirect: yamlProvider(
    'forcedirect',
    'akaDRJ/ClashCustomRule/master/forcedirect.yaml'
  ),
  fakeipfilter: mrsProvider(
    'fakeipfilter',
    'github.com/DustinWin/ruleset_geodata/releases/download/mihomo-ruleset/fakeip-filter.mrs'
  ),
  cnsite: mrsProvider(
    'cnsite',
    'github.com/DustinWin/ruleset_geodata/releases/download/mihomo-ruleset/cn.mrs'
  ),
  cdn: textProvider('cdn', 'ruleset.skk.moe/Clash/non_ip/cdn.txt')
};

// ======================== 其余配置 ========================
const snifferConfig = {
  sniff: {
    TLS: { ports: [443, 8443], 'override-destination': true },
    HTTP: { ports: [80, 8080, 8880], 'override-destination': false },
    QUIC: { ports: [443, 8443], 'override-destination': true }
  },
  enable: true,
  'parse-pure-ip': true,
  'force-dns-mapping': true,
  'skip-domain': ['Mijia Cloud', 'dlg.io.mi.com', '+.push.apple.com']
};

const dnsConfigBase = {
  enable: true,
  ipv6: options.ipv6Enabled,
  'prefer-h3': true,
  'enhanced-mode': 'fake-ip',
  'fake-ip-range': '198.20.0.1/16',
  'fake-ip-filter': [
    '+.drj028.com',
    'geosite:cn',
    'rule-set:cnsite',
    'rule-set:fakeipfilter'
  ],
  'default-nameserver': ['tls://223.5.5.5', 'tls://223.6.6.6'],
  nameserver: ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query']
};

const geoxURL = {
  geoip: `${CDN}/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat`,
  geosite: `${CDN}/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat`,
  mmdb: `${CDN}/gh/Loyalsoldier/geoip@release/Country.mmdb`,
  asn: `${CDN}/gh/Loyalsoldier/geoip@release/GeoLite2-ASN.mmdb`
};

// ===================== 国家识别与图标 =====================
const countryRegex = {
  香港: '(?i)香港|港|HK|hk|Hong Kong|HongKong|hongkong',
  澳门: '(?i)澳门|MO|Macau',
  台湾: '(?i)台|新北|彰化|TW|Taiwan',
  新加坡: '(?i)新加坡|坡|狮城|SG|Singapore',
  日本: '(?i)日本|川日|东京|大阪|泉日|埼玉|沪日|深日|JP|Japan',
  韩国: '(?i)KR|Korea|KOR|首尔|韩|韓',
  美国: '(?i)美国|美|US|United States',
  加拿大: '(?i)加拿大|Canada|CA',
  英国: '(?i)英国|United Kingdom|UK|伦敦|London',
  澳大利亚: '(?i)澳洲|澳大利亚|AU|Australia',
  德国: '(?i)德国|德|DE|Germany',
  法国: '(?i)法国|法|FR|France',
  俄罗斯: '(?i)俄罗斯|俄|RU|Russia',
  泰国: '(?i)泰国|泰|TH|Thailand',
  印度: '(?i)印度|IN|India',
  马来西亚: '(?i)马来西亚|马来|MY|Malaysia'
};

const countryIconURLs = {
  香港: ICON('Hong_Kong.png'),
  台湾: ICON('Taiwan.png'),
  新加坡: ICON('Singapore.png'),
  日本: ICON('Japan.png'),
  韩国: ICON('Korea.png'),
  美国: ICON('United_States.png'),
  英国: ICON('United_Kingdom.png'),
  加拿大: ICON('Canada.png'),
  澳大利亚: ICON('Australia.png'),
  德国: ICON('Germany.png'),
  俄罗斯: ICON('Russia.png'),
  泰国: ICON('Thailand.png'),
  印度: ICON('India.png'),
  马来西亚: ICON('Malaysia.png'),
  澳门: ICON('Macao.png'),
  法国: ICON('France.png')
};

const ISP_EXCLUDE_PATTERN =
  '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地';
const LOW_COST_PATTERN = '(?i)0\\.[0-5]|低倍率|省流|大流量|实验性';

const ISP_OR_LANDING_RE = makeRegex(ISP_EXCLUDE_PATTERN);
const LOW_COST_RE = makeRegex(LOW_COST_PATTERN);
const COUNTRY_ENTRIES = compileCountryEntries(countryRegex);
const COUNTRY_REGEX_MAP = new Map(
  COUNTRY_ENTRIES.map(({ country, regex }) => [country, regex])
);

const SERVICE_GROUP_SPECS = Object.freeze([
  { name: '静态资源', icon: 'Cloudflare.png', source: 'default' },
  { name: '人工智能', icon: 'Bot.png', source: 'default' },
  { name: '加密货币', icon: 'Cryptocurrency_3.png', source: 'default' },
  { name: 'PayPal', icon: 'PayPal.png', source: 'default' },
  { name: 'Telegram', icon: 'Telegram.png', source: 'default' },
  { name: 'Microsoft', icon: 'Microsoft.png', source: 'default' },
  { name: 'Apple', icon: 'Apple_2.png', source: 'default' },
  { name: 'Google', icon: 'Google_Search.png', source: 'default' },
  { name: 'YouTube', icon: 'YouTube.png', source: 'default' },
  { name: 'Disney', icon: 'Disney+.png', source: 'default' },
  { name: 'Netflix', icon: 'Netflix.png', source: 'default' },
  { name: 'Spotify', icon: 'Spotify.png', source: 'default' },
  { name: 'Twitter(X)', icon: 'Twitter.png', source: 'default' },
  { name: '学术资源', icon: 'Scholar.png', source: 'direct' },
  { name: '开发者资源', icon: 'GitHub.png', source: 'default' },
  { name: '游戏下载', icon: 'Game.png', source: 'default' },
  { name: '游戏平台', icon: 'Game.png', source: 'default' },
  { name: 'Speedtest', icon: 'Speedtest.png', source: 'default' }
]);

// ======================== 工具函数 ========================
function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

function compileCountryEntries(source) {
  const entries = [];
  for (const [country, pattern] of Object.entries(source)) {
    try {
      entries.push({ country, regex: makeRegex(pattern) });
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(`[convert.js] Skip invalid country pattern for ${country}:`, error);
      }
    }
  }
  return entries;
}

function makeRegex(pattern) {
  const cleaned = String(pattern || '').replace(/^\(\?i\)/, '');
  return new RegExp(cleaned, 'i');
}

function asString(value) {
  return typeof value === 'string' ? value : '';
}

function asPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeProxyList(config) {
  return asArray(config.proxies)
    .filter((proxy) => proxy && typeof proxy === 'object')
    .map((proxy) => ({ ...proxy, name: asString(proxy.name) }));
}

function isLowCostName(name) {
  return LOW_COST_RE.test(asString(name));
}

function isIspName(name) {
  return ISP_OR_LANDING_RE.test(asString(name));
}

function parseLowCostNodes(proxies) {
  return proxies
    .filter((proxy) => isLowCostName(proxy.name))
    .map((proxy) => proxy.name);
}

function parseLandingNodes(proxies) {
  return proxies
    .filter((proxy) => isIspName(proxy.name))
    .map((proxy) => proxy.name);
}

function parseCountryBuckets(proxies, countryList) {
  const buckets = Object.fromEntries(countryList.map((country) => [country, []]));

  for (const proxy of proxies) {
    const name = asString(proxy.name);
    if (!name || isIspName(name)) continue;

    for (const country of countryList) {
      const regex = COUNTRY_REGEX_MAP.get(country);
      if (regex && regex.test(name)) {
        buckets[country].push(name);
        break;
      }
    }
  }

  return buckets;
}

function insertAfter(arr, target, item) {
  if (!Array.isArray(arr) || arr.includes(item)) return;
  const index = arr.indexOf(target);
  if (index >= 0) {
    arr.splice(index + 1, 0, item);
  } else {
    arr.push(item);
  }
}

function insertUniqueAt(arr, index, values) {
  if (!Array.isArray(arr) || !Array.isArray(values) || values.length === 0) return;
  const filtered = values.filter((value) => !arr.includes(value));
  if (filtered.length === 0) return;
  arr.splice(index, 0, ...filtered);
}

function buildServiceGroups(defaultProxies, directProxies) {
  return SERVICE_GROUP_SPECS.map(({ name, icon, source }) => ({
    name,
    icon: ICON(icon),
    type: 'select',
    proxies: source === 'direct' ? directProxies : defaultProxies
  }));
}

// ======================== 国家解析 ========================
function parseCountries(proxies) {
  const matched = new Set();

  for (const proxy of proxies) {
    if (isIspName(proxy.name)) continue;

    for (const { country, regex } of COUNTRY_ENTRIES) {
      if (!matched.has(country) && regex.test(proxy.name)) {
        matched.add(country);
      }
    }
  }

  return COUNTRY_ENTRIES.map(({ country }) => country).filter((country) =>
    matched.has(country)
  );
}

// ========== 国家组（无智能兜底，固定排除 ISP/落地） ==========
function buildCountryProxyGroups(countryList, countryBuckets) {
  const groups = [];

  for (const country of countryList) {
    if (!countryRegex[country]) continue;

    const group = {
      name: `${country}节点`,
      icon: countryIconURLs[country],
      type: options.loadBalance ? 'load-balance' : 'url-test'
    };

    if (options.regexFilter) {
      Object.assign(group, {
        'include-all': true,
        filter: countryRegex[country],
        'exclude-filter': ISP_EXCLUDE_PATTERN
      });
    } else {
      const nodes = countryBuckets[country] || [];
      if (!nodes.length) continue;
      group.proxies = nodes;
    }

    if (!options.loadBalance) {
      Object.assign(group, { interval: 300, tolerance: 20, lazy: false });
    }

    groups.push(group);
  }

  return groups;
}

// ========================= 代理组 =========================
function buildProxyGroups(
  countryList,
  countryProxyGroups,
  lowCostNodes,
  landingNodes,
  defaults
) {
  const {
    defaultProxies,
    defaultSelector,
    defaultProxiesDirect,
    globalProxies
  } = defaults;

  const hasLowCostGroup = options.regexFilter || lowCostNodes.length > 0;
  const countryProxies = [];

  for (const country of countryList) {
    const groupName = `${country}节点`;
    insertAfter(globalProxies, '全球直连', groupName);
    countryProxies.push(groupName);
  }

  if (hasLowCostGroup) {
    insertAfter(globalProxies, '自动选择', '低倍率节点');
    countryProxies.push('低倍率节点');
  }

  insertUniqueAt(defaultProxies, 1, countryProxies);
  insertUniqueAt(defaultSelector, 1, countryProxies);
  insertUniqueAt(defaultProxiesDirect, 2, countryProxies);

  if (options.landing) {
    insertAfter(defaultProxies, '自动选择', '落地节点');
    if (!defaultSelector.includes('落地节点')) {
      defaultSelector.unshift('落地节点');
    }
    insertAfter(globalProxies, '自动选择', '落地节点');
    insertAfter(globalProxies, '落地节点', '前置代理');
  }

  const directFallbackProxies = ['节点选择', '手动切换', '全球直连'];
  const serviceGroups = buildServiceGroups(defaultProxies, directFallbackProxies);

  return [
    {
      name: '节点选择',
      icon: ICON('Proxy.png'),
      type: 'select',
      proxies: defaultSelector
    },

    options.landing
      ? {
          name: '落地节点',
          icon: ICON('Airport.png'),
          type: 'select',
          ...(options.regexFilter
            ? { 'include-all': true, filter: ISP_EXCLUDE_PATTERN }
            : { proxies: landingNodes })
        }
      : null,

    options.landing
      ? {
          name: '前置代理',
          icon: ICON('Area.png'),
          type: 'select',
          ...(options.regexFilter
            ? {
                'include-all': true,
                'exclude-filter': ISP_EXCLUDE_PATTERN,
                proxies: defaultSelector
              }
            : { proxies: defaultSelector })
        }
      : null,

    hasLowCostGroup
      ? {
          name: '低倍率节点',
          icon: ICON('Lab.png'),
          type: options.loadBalance ? 'load-balance' : 'url-test',
          ...(options.regexFilter
            ? { 'include-all': true, filter: LOW_COST_PATTERN }
            : { proxies: lowCostNodes })
        }
      : null,

    {
      name: '手动切换',
      icon: ICON('Proxy.png'),
      type: 'select',
      'include-all': true
    },

    {
      name: '自动选择',
      icon: ICON('Auto.png'),
      type: 'url-test',
      'include-all': true,
      'exclude-filter': ISP_EXCLUDE_PATTERN,
      interval: 300,
      tolerance: 20,
      lazy: false
    },

    {
      name: '强制代理',
      icon: ICON('Proxy.png'),
      type: 'select',
      proxies: ['节点选择', '手动切换', '全球直连']
    },

    ...serviceGroups,

    {
      name: '全球直连',
      icon: ICON('Direct.png'),
      type: 'select',
      proxies: ['DIRECT', '节点选择']
    },

    ...countryProxyGroups,

    {
      name: 'GLOBAL',
      icon: ICON('Global.png'),
      type: 'select',
      'include-all': true,
      proxies: globalProxies
    }
  ].filter(Boolean);
}

// ========================= 主入口 =========================
function main(config) {
  const safeConfig = asPlainObject(config);

  try {
    const proxies = normalizeProxyList(safeConfig);
    const defaultProxies = [...defaultProxiesBase];
    const defaultSelector = [...defaultSelectorBase];
    const defaultProxiesDirect = [...defaultProxiesDirectBase];
    const globalProxies = [...globalProxiesBase];
    const dnsConfig = { ...dnsConfigBase, ipv6: options.ipv6Enabled };

    const countryList = parseCountries(proxies);
    const lowCostNodes = parseLowCostNodes(proxies);
    const landingNodes = options.landing ? parseLandingNodes(proxies) : [];
    const countryBuckets = options.regexFilter
      ? {}
      : parseCountryBuckets(proxies, countryList);
    const countryProxyGroups = buildCountryProxyGroups(countryList, countryBuckets);

    const proxyGroups = buildProxyGroups(
      countryList,
      countryProxyGroups,
      lowCostNodes,
      landingNodes,
      { defaultProxies, defaultSelector, defaultProxiesDirect, globalProxies }
    );
    const finalRules = buildRules(options.quicEnabled);

    if (options.fullConfig) {
      Object.assign(safeConfig, {
        'mixed-port': 7890,
        'redir-port': 7892,
        'tproxy-port': 7893,
        'routing-mark': 7894,
        'allow-lan': true,
        ipv6: options.ipv6Enabled,
        mode: 'rule',
        'unified-delay': true,
        'tcp-concurrent': true,
        'find-process-mode': 'off',
        'log-level': 'info',
        'geodata-loader': 'standard',
        'external-controller': ':9999',
        'disable-keep-alive': !options.enableKeepAlive,
        profile: { 'store-selected': true }
      });
    }

    Object.assign(safeConfig, {
      'proxy-groups': proxyGroups,
      'rule-providers': ruleProviders,
      rules: finalRules,
      sniffer: snifferConfig,
      dns: dnsConfig,
      'geodata-mode': true,
      'geox-url': geoxURL
    });

    return safeConfig;
  } catch (error) {
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error('[convert.js] Failed to generate config:', error);
    }
    return safeConfig;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    main,
    metadata: {
      rules,
      ruleProviders,
      countryRegex
    }
  };
}
