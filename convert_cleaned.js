/*
powerfullz 的 Substore 订阅转换脚本（精简版）
https://github.com/powerfullz/override-rules

传入参数：
- loadbalance: 启用负载均衡 (默认 false)
- landing: 启用落地节点功能 (默认 false)
- ipv6: 启用 IPv6 支持 (默认 false)
- full: 启用完整配置，用于纯内核启动 (默认 false)
- keepalive: 启用 tcp-keep-alive (默认 false)
*/

// ====== 全局参数解析 ======
const inArg = $arguments || {};
const loadBalance    = parseBool(inArg.loadbalance) || false;
const landing        = parseBool(inArg.landing) || false;
const ipv6Enabled    = parseBool(inArg.ipv6) || false;
const fullConfig     = parseBool(inArg.full) || false;
const enableKeepAlive= parseBool(inArg.keepalive) || false;

// 如果你要启用“智能低倍率兜底”（国家组里只有低倍率时也保留它们），改为 true
const SMART_LOW_COST_FALLBACK = false;

// ====== 常量与基础数据 ======
const CDN = 'https://fastly.jsdelivr.net';
const ICON = (path) => `${CDN}/gh/Koolson/Qure@master/IconSet/Color/${path}`;

const defaultProxiesBase = Object.freeze([
  '节点选择', '自动选择', '手动切换', '全球直连'
]);
const defaultProxiesDirectBase = Object.freeze([
  '全球直连', '节点选择', '手动切换'
]);
const defaultSelectorBase = Object.freeze([
  '自动选择', '手动切换', 'DIRECT'
]);

const globalProxiesBase = Object.freeze([
  '节点选择','手动切换','自动选择','静态资源','人工智能','加密货币','PayPal','Telegram','Microsoft','Apple','Google','YouTube','Disney','Netflix','Spotify','Twitter(X)','学术资源','开发者资源','游戏平台','Speedtest','全球直连'
]);

const ruleProviders = Object.freeze({
  'pt':       httpRule('akaDRJ/ClashCustomRule/master/pt.yaml',       'domain'),
  'outlook':  httpRule('akaDRJ/ClashCustomRule/master/outlook.yaml',  'domain'),
  'crypto':   httpRule('akaDRJ/ClashCustomRule/master/crypto.yaml',   'domain'),
  'mining':   httpRule('akaDRJ/ClashCustomRule/master/mining.yaml',   'domain'),
  'cdn':      textRule('ruleset.skk.moe/Clash/non_ip/cdn.txt')
});

// 子集优先于母集的规则排序（已统一小写）
const rules = [
  // 1) 精确业务与特化集合（域名类）
  'rule-set,outlook,全球直连',
  'rule-set,cdn,静态资源',
  'rule-set,pt,全球直连',
  'geosite,category-pt,全球直连',

  // 2) 支付与商店
  'geosite,paypal@cn,全球直连',
  'geosite,paypal,paypal',
  'geosite,google-play@cn,全球直连',

  // 3) 通讯与流媒体
  'geosite,telegram,telegram',
  'geosite,youtube@cn,全球直连',
  'geosite,youtube,youtube',
  'geosite,disney,disney',
  'geosite,netflix,netflix',
  'geosite,spotify,spotify',
  'geosite,twitter,twitter(x)',
  'geosite,ookla-speedtest,speedtest',

  // 4) 开发者与游戏
  'geosite,category-dev,开发者资源',
  'geosite,category-games@cn,全球直连',
  'geosite,category-game-platforms-download,全球直连',
  'geosite,category-games,游戏平台',

  // 5) 学术
  'geosite,category-scholar-!cn,学术资源',
  'geosite,category-scholar-cn,全球直连',

  // 6) 加密货币
  'geosite,category-cryptocurrency,加密货币',
  'rule-set,crypto,加密货币',
  'rule-set,mining,加密货币',

  // 7) 平台生态
  'geosite,apple@cn,全球直连',
  'geosite,apple,apple',
  'geosite,microsoft@cn,全球直连',
  'geosite,microsoft,microsoft',
  'geosite,google,google',

  // 8) 国家与私有域直连
  'geosite,cn,全球直连',
  'geosite,private,全球直连',

  // 9) IP 集合
  'geoip,netflix,netflix,no-resolve',
  'geoip,google,google,no-resolve',
  'geoip,telegram,telegram,no-resolve',
  'geoip,cn,全球直连,no-resolve',
  'geoip,lan,全球直连,no-resolve',
  'geoip,private,全球直连,no-resolve',

  // 10) 兜底
  'match,节点选择'
];

const snifferConfig = Object.freeze({
  'sniff': {
    'TLS':   { 'ports': [443, 8443],  'override-destination': true },
    'HTTP':  { 'ports': [80, 8080, 8880], 'override-destination': false },
    'QUIC':  { 'ports': [443, 8443],  'override-destination': true }
  },
  'enable': true,
  'parse-pure-ip': true,
  'force-dns-mapping': true,
  'skip-domain': [
    'Mijia Cloud',
    'dlg.io.mi.com',
    '+.push.apple.com'
  ]
});

const dnsConfigBase = Object.freeze({
  'enable': true,
  'ipv6': ipv6Enabled,
  'prefer-h3': true,
  'enhanced-mode': 'fake-ip',
  'fake-ip-range': '198.20.0.1/16',
  'fake-ip-filter': [
    '+.lan','+.local','+.drj028.com',
    'geosite:cn','geosite:private','geosite:apple@cn','geosite:category-pt'
  ],
  'nameserver': ['223.5.5.5']
});

const geoxURL = Object.freeze({
  'geoip':  `${CDN}/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat`,
  'geosite':`${CDN}/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat`,
  'mmdb':   `${CDN}/gh/Loyalsoldier/geoip@release/Country.mmdb`,
  'asn':    `${CDN}/gh/Loyalsoldier/geoip@release/GeoLite2-ASN.mmdb`
});

const countryRegex = Object.freeze({
  '香港': '(?i)香港|港|HK|hk|Hong Kong|HongKong|hongkong',
  '澳门': '(?i)澳门|MO|Macau',
  '台湾': '(?i)台|新北|彰化|TW|Taiwan',
  '新加坡': '(?i)新加坡|坡|狮城|SG|Singapore',
  '日本': '(?i)日本|川日|东京|大阪|泉日|埼玉|沪日|深日|JP|Japan',
  '韩国': '(?i)KR|Korea|KOR|首尔|韩|韓',
  '美国': '(?i)美国|美|US|United States',
  '加拿大': '(?i)加拿大|Canada|CA',
  '英国': '(?i)英国|United Kingdom|UK|伦敦|London',
  '澳大利亚': '(?i)澳洲|澳大利亚|AU|Australia',
  '德国': '(?i)德国|德|DE|Germany',
  '法国': '(?i)法国|法|FR|France',
  '俄罗斯': '(?i)俄罗斯|俄|RU|Russia',
  '泰国': '(?i)泰国|泰|TH|Thailand',
  '印度': '(?i)印度|IN|India',
  '马来西亚': '(?i)马来西亚|马来|MY|Malaysia'
});

const countryIconURLs = Object.freeze({
  '香港': ICON('Hong_Kong.png'),
  '台湾': ICON('Taiwan.png'),
  '新加坡': ICON('Singapore.png'),
  '日本': ICON('Japan.png'),
  '韩国': ICON('Korea.png'),
  '美国': ICON('United_States.png'),
  '英国': ICON('United_Kingdom.png'),
  '加拿大': ICON('Canada.png'),
  '澳大利亚': ICON('Australia.png'),
  '德国': ICON('Germany.png'),
  '俄罗斯': ICON('Russia.png'),
  '泰国': ICON('Thailand.png'),
  '印度': ICON('India.png'),
  '马来西亚': ICON('Malaysia.png'),
  '澳门': ICON('Macao.png'),
  '法国': ICON('France.png')
});

// ====== 工具函数 ======
function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
  return false;
}

function httpRule(path, behavior) {
  return {
    'type': 'http',
    'behavior': behavior,
    'format': 'yaml',
    'interval': 86400,
    'url': `https://raw.githubusercontent.com/${path}`,
    'path': `./ruleset/${path.split('/').pop()}`
  };
}

function textRule(hostPath) {
  const filename = hostPath.split('/').pop();
  return {
    'type': 'http',
    'behavior': 'classical',
    'format': 'text',
    'interval': 86400,
    'url': `https://${hostPath}`,
    'path': `./ruleset/${filename}`
  };
}

// 去掉 (?i) 前缀并用 JS 的 i 标志
function makeRegex(pattern) {
  return new RegExp(String(pattern).replace(/^\(\?i\)/, ''), 'i');
}

// 安全插入：把 item 插到 arr 中 target 之后
function insertAfter(arr, target, item) {
  const i = arr.indexOf(target);
  if (i >= 0) arr.splice(i + 1, 0, item);
  else arr.push(item);
}

// 是否低倍率节点名
function isLowCostName(name) {
  return /0\.[0-5]|低倍率|省流|大流量|实验性/i.test(name);
}

// 是否落地/家宽等
function isIspName(name) {
  return /家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地/i.test(name);
}

// ====== 解析国家列表 ======
function parseCountries(config) {
  const proxies = config['proxies'] || [];
  const result = [];
  const seen = new Set();

  for (const [country, pattern] of Object.entries(countryRegex)) {
    const regex = makeRegex(pattern);
    for (const p of proxies) {
      const name = p.name || '';
      if (regex.test(name) && !isIspName(name)) {
        if (!seen.has(country)) {
          seen.add(country);
          result.push(country);
        }
      }
    }
  }
  return result;
}

// ====== 国家分组构建 ======
function buildCountryProxyGroups(countryList, config) {
  const groups = [];
  const proxies = config['proxies'] || [];

  for (const country of countryList) {
    if (!countryRegex[country]) continue;

    const pattern = countryRegex[country];
    const jsPattern = makeRegex(pattern);
    const hasNonLowCost = SMART_LOW_COST_FALLBACK
      ? proxies.some(p => jsPattern.test(p.name || '') && !isIspName(p.name || '') && !isLowCostName(p.name || ''))
      : true;

    const exclude = SMART_LOW_COST_FALLBACK && !hasNonLowCost
      ? '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地'
      : '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地';

    const group = {
      'name': `${country}节点`,
      'icon': countryIconURLs[country],
      'include-all': true,
      'filter': pattern,
      'exclude-filter': exclude,
      'type': loadBalance ? 'load-balance' : 'url-test'
    };

    if (!loadBalance) {
      Object.assign(group, { 'interval': 300, 'tolerance': 20, 'lazy': false });
    }
    groups.push(group);
  }
  return groups;
}

// ====== 代理组构建 ======
function buildProxyGroups(countryList, countryProxyGroups, lowCost, defaults) {
  const { defaultProxies, defaultSelector, defaultProxiesDirect, globalProxies } = defaults;
  const countryProxies = [];

  for (const country of countryList) {
    const groupName = `${country}节点`;
    globalProxies.push(groupName);
    countryProxies.push(groupName);
  }

  if (lowCost) {
    insertAfter(globalProxies, '自动选择', '低倍率节点');
    countryProxies.push('低倍率节点');
  }

  // 把国家组插入默认列表
  defaultProxies.splice(1, 0, ...countryProxies);
  defaultSelector.splice(1, 0, ...countryProxies);
  defaultProxiesDirect.splice(2, 0, ...countryProxies);

  // 落地处理
  if (landing) {
    insertAfter(defaultProxies, '自动选择', '落地节点');
    defaultSelector.unshift('落地节点');
    const i = globalProxies.indexOf('自动选择');
    if (i >= 0) globalProxies.splice(i, 0, '落地节点', '前置代理');
  }

  // 组定义
  const groups = [
    {
      'name': '节点选择',
      'icon': ICON('Proxy.png'),
      'type': 'select',
      'proxies': defaultSelector
    },
    landing ? {
      'name': '落地节点',
      'icon': ICON('Airport.png'),
      'type': 'select',
      'include-all': true,
      'filter': '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地'
    } : null,
    landing ? {
      'name': '前置代理',
      'icon': ICON('Area.png'),
      'type': 'select',
      'include-all': true,
      'exclude-filter': '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地',
      'proxies': defaultSelector
    } : null,
    lowCost ? {
      'name': '低倍率节点',
      'icon': ICON('Lab.png'),
      'type': loadBalance ? 'load-balance' : 'url-test',
      'include-all': true,
      'filter': '(?i)0\\.[0-5]|低倍率|省流|大流量|实验性'
    } : null,
    {
      'name': '手动切换',
      'icon': 'https://fastly.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/select.png',
      'include-all': true,
      'type': 'select'
    },
    {
      'name': '自动选择',
      'icon': ICON('Auto.png'),
      'type': 'url-test',
      'include-all': true,
      'exclude-filter': '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地',
      'interval': 300,
      'tolerance': 20,
      'lazy': false
    },
    {
      'name': '静态资源',
      'icon': ICON('Cloudflare.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': '人工智能',
      'icon': ICON('Bot.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': '加密货币',
      'icon': ICON('Cryptocurrency_3.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': 'PayPal',
      'icon': ICON('PayPal.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': 'Telegram',
      'icon': ICON('Telegram.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': 'Microsoft',
      'icon': ICON('Microsoft.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': 'Apple',
      'icon': ICON('Apple_2.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': 'Google',
      'icon': ICON('Google_Search.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': 'YouTube',
      'icon': ICON('YouTube.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': 'Disney',
      'icon': ICON('Disney+.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': 'Netflix',
      'icon': ICON('Netflix.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': 'Spotify',
      'icon': ICON('Spotify.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': 'Twitter(X)',
      'icon': ICON('Twitter.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': '学术资源',
      'icon': ICON('Scholar.png'),
      'type': 'select',
      'proxies': ['节点选择', '手动切换', '全球直连']
    },
    {
      'name': '开发者资源',
      'icon': ICON('GitHub.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': '游戏平台',
      'icon': ICON('Game.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': 'Speedtest',
      'icon': ICON('Speedtest.png'),
      'type': 'select',
      'proxies': defaultProxies
    },
    {
      'name': '全球直连',
      'icon': ICON('Direct.png'),
      'type': 'select',
      'proxies': ['DIRECT', '节点选择']
    },
    ...countryProxyGroups,
    {
      'name': 'GLOBAL',
      'icon': ICON('Global.png'),
      'include-all': true,
      'type': 'select',
      'proxies': globalProxies
    }
  ].filter(Boolean);

  return groups;
}

// ====== 主流程 ======
function main(config) {
  // 克隆可变数组，避免多次运行时被污染
  const defaultProxies      = [...defaultProxiesBase];
  const defaultSelector     = [...defaultSelectorBase];
  const defaultProxiesDirect= [...defaultProxiesDirectBase];
  const globalProxies       = [...globalProxiesBase];
  const dnsConfig           = { ...dnsConfigBase, ipv6: ipv6Enabled };

  const countryList = parseCountries(config);
  const lowCost = hasLowCost(config);
  const countryProxyGroups = buildCountryProxyGroups(countryList, config);
  const proxyGroups = buildProxyGroups(countryList, countryProxyGroups, lowCost, {
    defaultProxies, defaultSelector, defaultProxiesDirect, globalProxies
  });

  if (fullConfig) {
    Object.assign(config, {
      'mixed-port': 7890,
      'redir-port': 7892,
      'tproxy-port': 7893,
      'routing-mark': 7894,
      'allow-lan': true,
      'ipv6': ipv6Enabled,
      'mode': 'rule',
      'unified-delay': true,
      'tcp-concurrent': true,
      'find-process-mode': 'off',
      'log-level': 'info',
      'geodata-loader': 'standard',
      'external-controller': ':9999',
      'disable-keep-alive': !enableKeepAlive,
      'profile': { 'store-selected': true }
    });
  }

  Object.assign(config, {
    'proxy-groups': proxyGroups,
    'rule-providers': ruleProviders,
    'rules': rules,
    'sniffer': snifferConfig,
    'dns': dnsConfig,
    'geodata-mode': true,
    'geox-url': geoxURL
  });

  return config;
}

// === 工具：低倍率检测 ===
function hasLowCost(config) {
  const proxies = config['proxies'] || [];
  return proxies.some(p => isLowCostName(p.name || ''));
}
