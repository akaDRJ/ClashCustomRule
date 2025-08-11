/*
powerfullz 的 Substore 订阅转换脚本（最终修复版）
修复：补回 rule-providers，避免 “ruleset outlook not found”

说明：
- 关键字与集合标识统一小写（rule-set / geosite / geoip / match；第二段也小写）
- 第三段保留你的策略组名大小写（如 Microsoft、YouTube）
- 克隆基础数组避免重复运行污染
- 统一 ICON/Geo 数据源
*/

const inArg = $arguments || {};
const loadBalance = parseBool(inArg.loadbalance) || false;
const landing = parseBool(inArg.landing) || false;
const ipv6Enabled = parseBool(inArg.ipv6) || false;
const fullConfig = parseBool(inArg.full) || false;
const enableKeepAlive = parseBool(inArg.keepalive) || false;

// 智能低倍率兜底（国家组仅有低倍率时也保留它们）
const SMART_LOW_COST_FALLBACK = false;

// ===== 基础数组 =====
const defaultProxiesBase = Object.freeze(['节点选择','自动选择','手动切换','全球直连']);
const defaultProxiesDirectBase = Object.freeze(['全球直连','节点选择','手动切换']);
const defaultSelectorBase = Object.freeze(['自动选择','手动切换','DIRECT']);
const globalProxiesBase = Object.freeze([
  '节点选择','手动切换','自动选择','静态资源','人工智能','加密货币','PayPal','Telegram',
  'Microsoft','Apple','Google','YouTube','Disney','Netflix','Spotify','Twitter(X)',
  '学术资源','开发者资源','游戏平台','Speedtest','全球直连'
]);

// ===== 必要：rule-providers，名称要与 rules 的第一段一致 =====
const ruleProviders = {
  // 自定义 YAML（domain 行为）
  outlook: {
    type: 'http', behavior: 'domain', format: 'yaml', interval: 86400,
    url: 'https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/outlook.yaml',
    path: './ruleset/outlook.yaml'
  },
  pt: {
    type: 'http', behavior: 'domain', format: 'yaml', interval: 86400,
    url: 'https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/pt.yaml',
    path: './ruleset/pt.yaml'
  },
  crypto: {
    type: 'http', behavior: 'domain', format: 'yaml', interval: 86400,
    url: 'https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/crypto.yaml',
    path: './ruleset/crypto.yaml'
  },
  mining: {
    type: 'http', behavior: 'domain', format: 'yaml', interval: 86400,
    url: 'https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/mining.yaml',
    path: './ruleset/mining.yaml'
  },
  // 文本规则（classical 行为）
  cdn: {
    type: 'http', behavior: 'classical', format: 'text', interval: 86400,
    url: 'https://ruleset.skk.moe/Clash/non_ip/cdn.txt',
    path: './ruleset/cdn.txt'
  }
};

// ===== 规则（第一、二段小写，第三段保留大小写） =====
const rules = [
  'rule-set,outlook,全球直连',
  'rule-set,cdn,静态资源',
  'rule-set,pt,全球直连',
  'geosite,category-pt,全球直连',
  'geosite,paypal@cn,全球直连',
  'geosite,paypal,PayPal',
  'geosite,google-play@cn,全球直连',
  'geosite,telegram,Telegram',
  'geosite,category-ai-chat-!cn,人工智能',
  'geosite,youtube@cn,全球直连',
  'geosite,youtube,YouTube',
  'geosite,disney,Disney',
  'geosite,netflix,Netflix',
  'geosite,spotify,Spotify',
  'geosite,twitter,Twitter(X)',
  'geosite,ookla-speedtest,Speedtest',
  'geosite,category-dev,开发者资源',
  'geosite,category-games@cn,全球直连',
  'geosite,category-game-platforms-download,全球直连',
  'geosite,category-games,游戏平台',
  'geosite,category-scholar-!cn,学术资源',
  'geosite,category-scholar-cn,全球直连',
  'geosite,category-cryptocurrency,加密货币',
  'rule-set,crypto,加密货币',
  'rule-set,mining,加密货币',
  'geosite,apple@cn,全球直连',
  'geosite,apple,Apple',
  'geosite,microsoft@cn,全球直连',
  'geosite,microsoft,Microsoft',
  'geosite,google,Google',
  'geosite,cn,全球直连',
  'geosite,private,全球直连',
  'geoip,netflix,Netflix,no-resolve',
  'geoip,google,Google,no-resolve',
  'geoip,telegram,Telegram,no-resolve',
  'geoip,cn,全球直连,no-resolve',
  'geoip,lan,全球直连,no-resolve',
  'geoip,private,全球直连,no-resolve',
  'match,节点选择'
];

// ===== 其余配置 =====
const CDN = 'https://fastly.jsdelivr.net';
const ICON = (p) => `${CDN}/gh/Koolson/Qure@master/IconSet/Color/${p}`;
const snifferConfig = {
  sniff: {
    TLS: { ports: [443, 8443], 'override-destination': true },
    HTTP: { ports: [80, 8080, 8880], 'override-destination': false },
    QUIC: { ports: [443, 8443], 'override-destination': true }
  },
  enable: true, 'parse-pure-ip': true, 'force-dns-mapping': true,
  'skip-domain': ['Mijia Cloud', 'dlg.io.mi.com', '+.push.apple.com']
};
const dnsConfigBase = {
  enable: true, ipv6: ipv6Enabled, 'prefer-h3': true,
  'enhanced-mode': 'fake-ip', 'fake-ip-range': '198.20.0.1/16',
  'fake-ip-filter': ['+.lan','+.local','+.drj028.com','geosite:cn','geosite:private','geosite:apple@cn','geosite:category-pt'],
  nameserver: ['223.5.5.5']
};
const geoxURL = {
  geoip: `${CDN}/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat`,
  geosite: `${CDN}/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat`,
  mmdb: `${CDN}/gh/Loyalsoldier/geoip@release/Country.mmdb`,
  asn: `${CDN}/gh/Loyalsoldier/geoip@release/GeoLite2-ASN.mmdb`
};

const countryRegex = {
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

// ===== 工具 =====
function parseBool(v){ if(typeof v==='boolean')return v; if(typeof v==='string')return v.toLowerCase()==='true'||v==='1'; return false; }
function makeRegex(p){ return new RegExp(String(p).replace(/^\(\?i\)/,''),'i'); }
function isLowCostName(n){ return /0\.[0-5]|低倍率|省流|大流量|实验性/i.test(n); }
function isIspName(n){ return /家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地/i.test(n); }
function insertAfter(arr, target, item){ const i = arr.indexOf(target); if(i>=0) arr.splice(i+1,0,item); else arr.push(item); }

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

// ===== 国家组 =====
function buildCountryProxyGroups(countryList, config){
  const proxies = config.proxies || [];
  const groups = [];
  for(const c of countryList){
    if(!countryRegex[c]) continue;
    const pat = countryRegex[c];
    const jsPattern = makeRegex(pat);
    const hasNonLow = SMART_LOW_COST_FALLBACK
      ? proxies.some(x => jsPattern.test(x.name||'') && !isIspName(x.name||'') && !isLowCostName(x.name||''))
      : true;
    const excl = SMART_LOW_COST_FALLBACK && !hasNonLow
      ? '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地'
      : '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地';
    const g = {
      name: `${c}节点`, icon: countryIconURLs[c],
      'include-all': true, filter: pat, 'exclude-filter': excl,
      type: loadBalance ? 'load-balance' : 'url-test'
    };
    if(!loadBalance) Object.assign(g,{ interval:300, tolerance:20, lazy:false });
    groups.push(g);
  }
  return groups;
}

// ===== 代理组 =====
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
  const groups = [
    { name:'节点选择', icon:ICON('Proxy.png'), type:'select', proxies: defaultSelector },
    landing ? { name:'落地节点', icon:ICON('Airport.png'), type:'select', 'include-all':true, filter:'(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地' } : null,
    landing ? { name:'前置代理', icon:ICON('Area.png'), type:'select', 'include-all':true, 'exclude-filter':'(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地', proxies: defaultSelector } : null,
    lowCost ? { name:'低倍率节点', icon:ICON('Lab.png'), type: loadBalance ? 'load-balance' : 'url-test', 'include-all':true, filter:'(?i)0\\.[0-5]|低倍率|省流|大流量|实验性' } : null,
    { name:'手动切换', icon:ICON('Proxy.png'), 'include-all':true, type:'select' },
    { name:'自动选择', icon:ICON('Auto.png'), type:'url-test', 'include-all':true, 'exclude-filter':'(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地', interval:300, tolerance:20, lazy:false },
    { name:'静态资源', icon:ICON('Cloudflare.png'), type:'select', proxies: defaultProxies },
    { name:'人工智能', icon:ICON('Bot.png'), type:'select', proxies: defaultProxies },
    { name:'加密货币', icon:ICON('Cryptocurrency_3.png'), type:'select', proxies: defaultProxies },
    { name:'PayPal', icon:ICON('PayPal.png'), type:'select', proxies: defaultProxies },
    { name:'Telegram', icon:ICON('Telegram.png'), type:'select', proxies: defaultProxies },
    { name:'Microsoft', icon:ICON('Microsoft.png'), type:'select', proxies: defaultProxies },
    { name:'Apple', icon:ICON('Apple_2.png'), type:'select', proxies: defaultProxies },
    { name:'Google', icon:ICON('Google_Search.png'), type:'select', proxies: defaultProxies },
    { name:'YouTube', icon:ICON('YouTube.png'), type:'select', proxies: defaultProxies },
    { name:'Disney', icon:ICON('Disney+.png'), type:'select', proxies: defaultProxies },
    { name:'Netflix', icon:ICON('Netflix.png'), type:'select', proxies: defaultProxies },
    { name:'Spotify', icon:ICON('Spotify.png'), type:'select', proxies: defaultProxies },
    { name:'Twitter(X)', icon:ICON('Twitter.png'), type:'select', proxies: defaultProxies },
    { name:'学术资源', icon:ICON('Scholar.png'), type:'select', proxies:['节点选择','手动切换','全球直连'] },
    { name:'开发者资源', icon:ICON('GitHub.png'), type:'select', proxies: defaultProxies },
    { name:'游戏平台', icon:ICON('Game.png'), type:'select', proxies: defaultProxies },
    { name:'Speedtest', icon:ICON('Speedtest.png'), type:'select', proxies: defaultProxies },
    { name:'全球直连', icon:ICON('Direct.png'), type:'select', proxies:['DIRECT','节点选择'] },
    ...countryProxyGroups,
    { name:'GLOBAL', icon:ICON('Global.png'), 'include-all':true, type:'select', proxies: globalProxies }
  ].filter(Boolean);
  return groups;
}

// ===== 主入口 =====
function main(config){
  const defaultProxies = [...defaultProxiesBase];
  const defaultSelector = [...defaultSelectorBase];
  const defaultProxiesDirect = [...defaultProxiesDirectBase];
  const globalProxies = [...globalProxiesBase];
  const dnsConfig = { ...dnsConfigBase, ipv6: ipv6Enabled };

  const countryList = parseCountries(config);
  const lowCost = (config.proxies||[]).some(p => isLowCostName(p.name||''));
  const countryProxyGroups = buildCountryProxyGroups(countryList, config);
  const proxyGroups = buildProxyGroups(countryList, countryProxyGroups, lowCost, {
    defaultProxies, defaultSelector, defaultProxiesDirect, globalProxies
  });

  if(fullConfig){
    Object.assign(config, {
      'mixed-port':7890, 'redir-port':7892, 'tproxy-port':7893, 'routing-mark':7894,
      'allow-lan':true, ipv6:ipv6Enabled, mode:'rule', 'unified-delay':true,
      'tcp-concurrent':true, 'find-process-mode':'off', 'log-level':'info',
      'geodata-loader':'standard', 'external-controller':':9999',
      'disable-keep-alive':!enableKeepAlive, profile:{ 'store-selected':true }
    });
  }

  Object.assign(config, {
    'proxy-groups': proxyGroups,
    'rule-providers': ruleProviders,   // 关键：注入 providers
    'rules': rules,
    'sniffer': snifferConfig,
    'dns': dnsConfig,
    'geodata-mode': true,
    'geox-url': geoxURL
  });
  return config;
}
