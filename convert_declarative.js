/*
powerfullz 的 Substore 订阅转换脚本（声明式功能组版）
要点：
- 所有业务策略组（人工智能、加密货币、Spotify、YouTube、Netflix、PayPal、Telegram、Microsoft、Apple、Google、Twitter(X)、开发者资源、游戏平台、Speedtest、静态资源、学术资源等）统一用“目录配置 FEATURE_GROUPS”声明。
- 由目录自动生成：rules（前两段小写，第三段保留策略组名大小写）、proxy-groups、GLOBAL 列表项。
- 固定直连/地区特化（如 *@cn 直连、学术境内直连、游戏平台下载直连）仍然写成固定规则，保持子集在母集前、域名在 IP 前、直连在代理前的顺序。
- 去掉“智能低倍率兜底”，国家组只排除 ISP/落地关键词。
- 克隆基础数组避免多次运行污染；统一 ICON/Geo 源；正则工具化；rule-providers 用工厂函数。
*/

// ===== 运行参数 =====
const inArg = $arguments || {};
const loadBalance     = parseBool(inArg.loadbalance) || false;
const landing         = parseBool(inArg.landing) || false;
const ipv6Enabled     = parseBool(inArg.ipv6) || false;
const fullConfig      = parseBool(inArg.full) || false;
const enableKeepAlive = parseBool(inArg.keepalive) || false;

// ===== 基础数组（只读基线，运行时克隆） =====
const defaultProxiesBase       = Object.freeze(['节点选择','自动选择','手动切换','全球直连']);
const defaultProxiesDirectBase = Object.freeze(['全球直连','节点选择','手动切换']);
const defaultSelectorBase      = Object.freeze(['自动选择','手动切换','DIRECT']);

// GLOBAL 初始放三个基础项和收口“全球直连”，功能组稍后按顺序插入到“自动选择”后、“全球直连”前
const globalProxiesBase        = Object.freeze(['节点选择','手动切换','自动选择','全球直连']);

// ===== 统一资源与图标 =====
const CDN  = 'https://fastly.jsdelivr.net';
const ICON = (p) => `${CDN}/gh/Koolson/Qure@master/IconSet/Color/${p}`;

// ===== rule-providers（工厂函数） =====
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
  pt:      yamlProvider('pt',      'akaDRJ/ClashCustomRule/master/pt.yaml'),
  crypto:  yamlProvider('crypto',  'akaDRJ/ClashCustomRule/master/crypto.yaml'),
  mining:  yamlProvider('mining',  'akaDRJ/ClashCustomRule/master/mining.yaml'),
  cdn:     textProvider('cdn',     'ruleset.skk.moe/Clash/non_ip/cdn.txt')
};

// ===== 工具函数 =====
function parseBool(v){ if(typeof v==='boolean') return v; if(typeof v==='string') return v.toLowerCase()==='true'||v==='1'; return false; }
function makeRegex(p){ return new RegExp(String(p).replace(/^\(\?i\)/,''),'i'); }
function isLowCostName(n){ return /0\.[0-5]|低倍率|省流|大流量|实验性/i.test(n); }
function isIspName(n){ return /家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地/i.test(n); }
function insertAfter(arr, target, item){ const i = arr.indexOf(target); if(i>=0) arr.splice(i+1,0,item); else arr.push(item); }
function insertBefore(arr, target, item){ const i = arr.indexOf(target); if(i>=0) arr.splice(i,0,item); else arr.push(item); }

// ===== 国家识别与图标 =====
const countryRegex = {
  '香港':      '(?i)香港|港|HK|hk|Hong Kong|HongKong|hongkong',
  '澳门':      '(?i)澳门|MO|Macau',
  '台湾':      '(?i)台|新北|彰化|TW|Taiwan',
  '新加坡':    '(?i)新加坡|坡|狮城|SG|Singapore',
  '日本':      '(?i)日本|川日|东京|大阪|泉日|埼玉|沪日|深日|JP|Japan',
  '韩国':      '(?i)KR|Korea|KOR|首尔|韩|韓',
  '美国':      '(?i)美国|美|US|United States',
  '加拿大':    '(?i)加拿大|Canada|CA',
  '英国':      '(?i)英国|United Kingdom|UK|伦敦|London',
  '澳大利亚':  '(?i)澳洲|澳大利亚|AU|Australia',
  '德国':      '(?i)德国|德|DE|Germany',
  '法国':      '(?i)法国|法|FR|France',
  '俄罗斯':    '(?i)俄罗斯|俄|RU|Russia',
  '泰国':      '(?i)泰国|泰|TH|Thailand',
  '印度':      '(?i)印度|IN|India',
  '马来西亚':  '(?i)马来西亚|马来|MY|Malaysia'
};
const countryIconURLs = {
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
};

// ===== 国家解析 =====
function parseCountries(config){
  const proxies = config.proxies || [];
  const res = [], seen = new Set();
  for(const [c, pat] of Object.entries(countryRegex)){
    const r = makeRegex(pat);
    for(const p of proxies){
      const n = p.name || '';
      if(r.test(n) && !isIspName(n) && !seen.has(c)){ seen.add(c); res.push(c); }
    }
  }
  return res;
}

// ===== 国家组（固定排除 ISP/落地） =====
function buildCountryProxyGroups(countryList){
  const groups = [];
  for(const c of countryList){
    if(!countryRegex[c]) continue;
    const pat = countryRegex[c];
    const g = {
      name: `${c}节点`,
      icon: countryIconURLs[c],
      'include-all': true,
      filter: pat,
      'exclude-filter': '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地',
      type: loadBalance ? 'load-balance' : 'url-test'
    };
    if(!loadBalance) Object.assign(g,{ interval: 300, tolerance: 20, lazy: false });
    groups.push(g);
  }
  return groups;
}

// ===== 声明式功能组目录 =====
// 说明：order 控制排序；ruleEntries 是 rules 的条目（[type, key, target, extra?]）
// type 与 key 会被强制小写；target 原样作为策略组名（大小写不变）；extra 可放 no-resolve
const FEATURE_GROUPS = [
  {
    key: 'static',
    name: '静态资源',
    icon: 'Cloudflare.png',
    enabled: true,
    order: 10,
    ruleEntries: [
      ['rule-set', 'cdn', '静态资源']
    ]
  },
  {
    key: 'telegram',
    name: 'Telegram',
    icon: 'Telegram.png',
    enabled: true,
    order: 20,
    ruleEntries: [
      ['geosite', 'telegram', 'Telegram'],
      ['geoip',   'telegram', 'Telegram', 'no-resolve']
    ]
  },
  {
    key: 'youtube',
    name: 'YouTube',
    icon: 'YouTube.png',
    enabled: true,
    order: 21,
    ruleEntries: [
      ['geosite', 'youtube', 'YouTube']
    ]
  },
  {
    key: 'disney',
    name: 'Disney',
    icon: 'Disney+.png',
    enabled: true,
    order: 22,
    ruleEntries: [
      ['geosite', 'disney', 'Disney']
    ]
  },
  {
    key: 'netflix',
    name: 'Netflix',
    icon: 'Netflix.png',
    enabled: true,
    order: 23,
    ruleEntries: [
      ['geosite', 'netflix', 'Netflix'],
      ['geoip',   'netflix', 'Netflix', 'no-resolve']
    ]
  },
  {
    key: 'spotify',
    name: 'Spotify',
    icon: 'Spotify.png',
    enabled: true,
    order: 24,
    ruleEntries: [
      ['geosite', 'spotify', 'Spotify']
    ]
  },
  {
    key: 'twitter',
    name: 'Twitter(X)',
    icon: 'Twitter.png',
    enabled: true,
    order: 25,
    ruleEntries: [
      ['geosite', 'twitter', 'Twitter(X)']
    ]
  },
  {
    key: 'speedtest',
    name: 'Speedtest',
    icon: 'Speedtest.png',
    enabled: true,
    order: 26,
    ruleEntries: [
      ['geosite', 'ookla-speedtest', 'Speedtest']
    ]
  },
  {
    key: 'dev',
    name: '开发者资源',
    icon: 'GitHub.png',
    enabled: true,
    order: 30,
    ruleEntries: [
      ['geosite', 'category-dev', '开发者资源']
    ]
  },
  {
    key: 'games',
    name: '游戏平台',
    icon: 'Game.png',
    enabled: true,
    order: 31,
    ruleEntries: [
      ['geosite', 'category-games', '游戏平台']
    ]
  },
  {
    key: 'ai',
    name: '人工智能',
    icon: 'Bot.png',
    enabled: true,
    order: 32,
    ruleEntries: [
      ['geosite', 'category-ai-chat-!cn', '人工智能']
    ]
  },
  {
    key: 'crypto',
    name: '加密货币',
    icon: 'Cryptocurrency_3.png',
    enabled: true,
    order: 40,
    ruleEntries: [
      ['geosite', 'category-cryptocurrency', '加密货币'],
      ['rule-set', 'crypto', '加密货币'],
      ['rule-set', 'mining', '加密货币']
    ]
  },
  {
    key: 'paypal',
    name: 'PayPal',
    icon: 'PayPal.png',
    enabled: true,
    order: 45,
    ruleEntries: [
      ['geosite', 'paypal', 'PayPal']
    ]
  },
  {
    key: 'microsoft',
    name: 'Microsoft',
    icon: 'Microsoft.png',
    enabled: true,
    order: 50,
    ruleEntries: [
      ['geosite', 'microsoft', 'Microsoft']
    ]
  },
  {
    key: 'apple',
    name: 'Apple',
    icon: 'Apple_2.png',
    enabled: true,
    order: 51,
    ruleEntries: [
      ['geosite', 'apple', 'Apple']
    ]
  },
  {
    key: 'google',
    name: 'Google',
    icon: 'Google_Search.png',
    enabled: true,
    order: 52,
    ruleEntries: [
      ['geosite', 'google', 'Google'],
      ['geoip',   'google', 'Google', 'no-resolve']
    ]
  },
  {
    key: 'scholar',
    name: '学术资源',
    icon: 'Scholar.png',
    enabled: true,
    order: 60,
    ruleEntries: [
      ['geosite', 'category-scholar-!cn', '学术资源']
    ],
    // 学术资源组有自定义代理列表（而非 defaultProxies）
    proxiesOverride: ['节点选择','手动切换','全球直连']
  }
];

// ===== 由目录生成：rules、proxy-groups、GLOBAL 增补 =====
function buildFeatureRules() {
  const on = FEATURE_GROUPS.filter(g => g.enabled).sort((a,b) => a.order - b.order);
  const list = [];
  for (const g of on) {
    for (const r of g.ruleEntries) {
      const [type, key, target, extra] = r;
      const head = String(type).toLowerCase();
      const mid  = String(key).toLowerCase();
      if (extra) list.push(`${head},${mid},${target},${extra}`);
      else       list.push(`${head},${mid},${target}`);
    }
  }
  return list;
}

function buildFeatureProxyGroups(defaultProxies) {
  const on = FEATURE_GROUPS.filter(g => g.enabled).sort((a,b) => a.order - b.order);
  return on.map(g => ({
    name: g.name,
    icon: ICON(g.icon),
    type: 'select',
    proxies: g.proxiesOverride || defaultProxies
  }));
}

function extendGlobalProxies(globalProxies) {
  const on = FEATURE_GROUPS.filter(g => g.enabled).sort((a,b) => a.order - b.order);
  for (const g of on) {
    if (!globalProxies.includes(g.name)) {
      // 插在 “全球直连” 前面，如果找不到就推到末尾
      const anchor = '全球直连';
      const i = globalProxies.indexOf(anchor);
      if (i >= 0) globalProxies.splice(i, 0, g.name);
      else globalProxies.push(g.name);
    }
  }
}

// ===== 固定规则（子集在前，直连在前，域名在前，IP 次之） =====
function buildFixedRules() {
  return [
    // 1) 精确业务与特化集合（域名类）
    'rule-set,outlook,全球直连',
    'rule-set,pt,全球直连',
    'geosite,category-pt,全球直连',

    // 2) 支付与商店的直连优先
    'geosite,paypal@cn,全球直连',
    'geosite,google-play@cn,全球直连',

    // 3) 即时通讯与流媒体子集直连
    'geosite,youtube@cn,全球直连',

    // 4) 开发者与游戏类的直连特化
    'geosite,category-games@cn,全球直连',
    'geosite,category-game-platforms-download,全球直连',

    // 5) 学术类：境外走学术资源组，境内直连（境外这部分由 FEATURE_GROUPS 产出）
    'geosite,category-scholar-cn,全球直连',

    // 6) 平台生态：Apple/Microsoft 的中国域直连
    'geosite,apple@cn,全球直连',
    'geosite,microsoft@cn,全球直连',

    // 7) 国家与私有域直连收口（域名）
    'geosite,cn,全球直连',
    'geosite,private,全球直连',

    // 8) IP 直连收口
    'geoip,cn,全球直连,no-resolve',
    'geoip,lan,全球直连,no-resolve',
    'geoip,private,全球直连,no-resolve'
  ];
}

// ===== 汇总规则（固定 + 功能组 + 其它 geoip 业务项） =====
function buildAllRules() {
  const rules = [];
  // 固定在最前的直连等
  rules.push(...buildFixedRules());
  // 功能组生成的规则（人工智能、加密货币、Spotify 等）
  rules.push(...buildFeatureRules());
  // 其余 geoip 业务项如果未在 FEATURE_GROUPS 覆盖，可在此追加（已在目录中添加 google/netflix/telegram）

  // 最终兜底
  rules.push('match,节点选择'); // 注意：match 必须在最后，不能动
  return rules;
}

// ===== 代理组构建 =====
function buildProxyGroups(countryList, countryProxyGroups, lowCost, defaults){
  const { defaultProxies, defaultSelector, defaultProxiesDirect, globalProxies } = defaults;
  const countryProxies = [];
  for(const c of countryList){
    const g = `${c}节点`; globalProxies.push(g); countryProxies.push(g);
  }
  if(lowCost){ insertAfter(globalProxies,'自动选择','低倍率节点'); countryProxies.push('低倍率节点'); }
  defaultProxies.splice(1,0,...countryProxies);
  defaultSelector.splice(1,0,...countryProxies);
  defaultProxiesDirect.splice(2,0,...countryProxies);

  if(landing){
    insertAfter(defaultProxies,'自动选择','落地节点');
    defaultSelector.unshift('落地节点');
    insertAfter(globalProxies,'自动选择','落地节点');
    insertAfter(globalProxies,'落地节点','前置代理');
  }

  // 将功能组加入 GLOBAL 列表（插在“全球直连”之前）
  extendGlobalProxies(globalProxies);

  const groups = [
    { name: '节点选择', icon: ICON('Proxy.png'), type: 'select', proxies: defaultSelector },
    landing ? { name: '落地节点', icon: ICON('Airport.png'), type: 'select', 'include-all': true, filter: '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地' } : null,
    landing ? { name: '前置代理', icon: ICON('Area.png'), type: 'select', 'include-all': true, 'exclude-filter': '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地', proxies: defaultSelector } : null,
    lowCost ? { name: '低倍率节点', icon: ICON('Lab.png'), type: loadBalance ? 'load-balance' : 'url-test', 'include-all': true, filter: '(?i)0\\.[0-5]|低倍率|省流|大流量|实验性' } : null,
    { name: '手动切换', icon: ICON('Proxy.png'), 'include-all': true, type: 'select' },
    { name: '自动选择', icon: ICON('Auto.png'), type: 'url-test', 'include-all': true, 'exclude-filter': '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地', interval: 300, tolerance: 20, lazy: false },

    // 动态功能组（按目录声明生成）
    // 保留“静态资源”等业务组原行为：均为 select + defaultProxies，除非组内定义了 proxiesOverride
    ...buildFeatureProxyGroups(defaultProxies),

    { name: '全球直连', icon: ICON('Direct.png'), type: 'select', proxies: ['DIRECT','节点选择'] },
    ...countryProxyGroups,
    { name: 'GLOBAL', icon: ICON('Global.png'), 'include-all': true, type: 'select', proxies: globalProxies }
  ].filter(Boolean);
  return groups;
}

// ===== 主入口 =====
function main(config){
  const defaultProxies       = [...defaultProxiesBase];
  const defaultSelector      = [...defaultSelectorBase];
  const defaultProxiesDirect = [...defaultProxiesDirectBase];
  const globalProxies        = [...globalProxiesBase];
  const dnsConfig            = {
    enable: true,
    ipv6: ipv6Enabled,
    'prefer-h3': true,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.20.0.1/16',
    'fake-ip-filter': ['+.lan','+.local','+.drj028.com','geosite:cn','geosite:private','geosite:apple@cn','geosite:category-pt'],
    nameserver: ['223.5.5.5']
  };

  const countryList          = parseCountries(config);
  const countryProxyGroups   = buildCountryProxyGroups(countryList);
  const lowCost              = (config.proxies || []).some(p => isLowCostName(p.name || ''));
  const proxyGroups          = buildProxyGroups(countryList, countryProxyGroups, lowCost, {
    defaultProxies, defaultSelector, defaultProxiesDirect, globalProxies
  });

  // 合成完整 rules：固定规则 + 目录生成 + match
  const rules = buildAllRules();

  if(fullConfig){
    Object.assign(config, {
      'mixed-port': 7890, 'redir-port': 7892, 'tproxy-port': 7893, 'routing-mark': 7894,
      'allow-lan': true, ipv6: ipv6Enabled, mode: 'rule', 'unified-delay': true,
      'tcp-concurrent': true, 'find-process-mode': 'off', 'log-level': 'info',
      'geodata-loader': 'standard', 'external-controller': ':9999',
      'disable-keep-alive': !enableKeepAlive, profile: { 'store-selected': true }
    });
  }

  Object.assign(config, {
    'proxy-groups':   proxyGroups,
    'rule-providers': ruleProviders,
    'rules':          rules,
    'sniffer':        {
      sniff: {
        TLS:  { ports: [443, 8443], 'override-destination': true },
        HTTP: { ports: [80, 8080, 8880], 'override-destination': false },
        QUIC: { ports: [443, 8443], 'override-destination': true }
      },
      enable: true,
      'parse-pure-ip': true,
      'force-dns-mapping': true,
      'skip-domain': ['Mijia Cloud','dlg.io.mi.com','+.push.apple.com']
    },
    'dns':            {
      enable: true,
      ipv6: ipv6Enabled,
      'prefer-h3': true,
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.20.0.1/16',
      'fake-ip-filter': ['+.lan','+.local','+.drj028.com','geosite:cn','geosite:private','geosite:apple@cn','geosite:category-pt'],
      nameserver: ['223.5.5.5']
    },
    'geodata-mode':   true,
    'geox-url':       {
      geoip:   `${CDN}/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat`,
      geosite: `${CDN}/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat`,
      mmdb:    `${CDN}/gh/Loyalsoldier/geoip@release/Country.mmdb`,
      asn:     `${CDN}/gh/Loyalsoldier/geoip@release/GeoLite2-ASN.mmdb`
    }
  });
  return config;
}
