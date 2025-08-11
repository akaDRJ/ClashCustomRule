/*
powerfullz 的 Substore 订阅转换脚本（全声明式版，无权重，含直连）
特性：
- 所有策略组与直连规则都由 FEATURE_GROUPS 顺序生成（谁在前面，谁先生成）
- 第一、二段强制小写；第三段保留策略组名大小写
- rule-providers 工厂函数；数组克隆防污染；统一 ICON/CDN；正则工具化
*/

const inArg = $arguments || {};
const loadBalance     = parseBool(inArg.loadbalance) || false;
const landing         = parseBool(inArg.landing) || false;
const ipv6Enabled     = parseBool(inArg.ipv6) || false;
const fullConfig      = parseBool(inArg.full) || false;
const enableKeepAlive = parseBool(inArg.keepalive) || false;

// ===== 统一资源与工具 =====
const CDN  = 'https://fastly.jsdelivr.net';
const ICON = (p) => `${CDN}/gh/Koolson/Qure@master/IconSet/Color/${p}`;
function parseBool(v){ if(typeof v==='boolean') return v; if(typeof v==='string') return v.toLowerCase()==='true'||v==='1'; return false; }
function makeRegex(p){ return new RegExp(String(p).replace(/^\(\?i\)/,''),'i'); }
function isLowCostName(n){ return /0\.[0-5]|低倍率|省流|大流量|实验性/i.test(n); }
function isIspName(n){ return /家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地/i.test(n); }
function insertAfter(arr, target, item){ const i = arr.indexOf(target); if(i>=0) arr.splice(i+1,0,item); else arr.push(item); }

// ===== rule-providers（工厂函数） =====
function yamlProvider(name, repoPath){ return { type:'http', behavior:'domain', format:'yaml', interval:86400, url:`https://raw.githubusercontent.com/${repoPath}`, path:`./ruleset/${name}.yaml` }; }
function textProvider(name, hostPath){ return { type:'http', behavior:'classical', format:'text', interval:86400, url:`https://${hostPath}`, path:`./ruleset/${name}.txt` }; }
const ruleProviders = {
  outlook: yamlProvider('outlook','akaDRJ/ClashCustomRule/master/outlook.yaml'),
  pt:      yamlProvider('pt','akaDRJ/ClashCustomRule/master/pt.yaml'),
  crypto:  yamlProvider('crypto','akaDRJ/ClashCustomRule/master/crypto.yaml'),
  mining:  yamlProvider('mining','akaDRJ/ClashCustomRule/master/mining.yaml'),
  cdn:     textProvider('cdn','ruleset.skk.moe/Clash/non_ip/cdn.txt'),
};

// ===== 基础数组（只读基线，运行克隆） =====
const defaultProxiesBase       = Object.freeze(['节点选择','自动选择','手动切换','全球直连']);
const defaultProxiesDirectBase = Object.freeze(['全球直连','节点选择','手动切换']);
const defaultSelectorBase      = Object.freeze(['自动选择','手动切换','DIRECT']);
const globalProxiesBase        = Object.freeze(['节点选择','手动切换','自动选择','全球直连']); // 其余由 FEATURE_GROUPS 注入

// ===== 声明式目录：按写的顺序生成（enabled=false 即可临时关闭） =====
// createProxyGroup: false 表示只生成规则，不创建可选分组（直连类就这样）
// proxiesOverride: 为特定分组改用自定义候选（默认用 defaultProxies）
const FEATURE_GROUPS = [
  // 1) 精确业务与特化集合
  { key:'outlook', name:'全球直连', icon:'Direct.png', enabled:true, createProxyGroup:false,
    ruleEntries:[ ['rule-set','outlook','全球直连'] ] },
  { key:'cdn', name:'静态资源', icon:'Cloudflare.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['rule-set','cdn','静态资源'] ] },
  { key:'pt', name:'全球直连', icon:'Direct.png', enabled:true, createProxyGroup:false,
    ruleEntries:[ ['rule-set','pt','全球直连'], ['geosite','category-pt','全球直连'] ] },

  // 2) 支付与商店
  { key:'paypal-cn', name:'全球直连', icon:'Direct.png', enabled:true, createProxyGroup:false,
    ruleEntries:[ ['geosite','paypal@cn','全球直连'] ] },
  { key:'paypal', name:'PayPal', icon:'PayPal.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','paypal','PayPal'] ] },
  { key:'gplay-cn', name:'全球直连', icon:'Direct.png', enabled:true, createProxyGroup:false,
    ruleEntries:[ ['geosite','google-play@cn','全球直连'] ] },

  // 3) 通讯与流媒体（AI 放在 Telegram 之后、YouTube 之前）
  { key:'telegram', name:'Telegram', icon:'Telegram.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','telegram','Telegram'], ['geoip','telegram','Telegram','no-resolve'] ] },
  { key:'ai', name:'人工智能', icon:'Bot.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','category-ai-chat-!cn','人工智能'] ] },
  { key:'youtube', name:'YouTube', icon:'YouTube.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','youtube@cn','全球直连'], ['geosite','youtube','YouTube'] ] },
  { key:'disney', name:'Disney', icon:'Disney+.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','disney','Disney'] ] },
  { key:'netflix', name:'Netflix', icon:'Netflix.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','netflix','Netflix'], ['geoip','netflix','Netflix','no-resolve'] ] },
  { key:'spotify', name:'Spotify', icon:'Spotify.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','spotify','Spotify'] ] },
  { key:'twitter', name:'Twitter(X)', icon:'Twitter.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','twitter','Twitter(X)'] ] },
  { key:'speedtest', name:'Speedtest', icon:'Speedtest.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','ookla-speedtest','Speedtest'] ] },

  // 4) 开发者与游戏
  { key:'dev', name:'开发者资源', icon:'GitHub.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','category-dev','开发者资源'] ] },
  { key:'game-cn', name:'全球直连', icon:'Direct.png', enabled:true, createProxyGroup:false,
    ruleEntries:[ ['geosite','category-games@cn','全球直连'], ['geosite','category-game-platforms-download','全球直连'] ] },
  { key:'games', name:'游戏平台', icon:'Game.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','category-games','游戏平台'] ] },

  // 5) 学术
  { key:'scholar-foreign', name:'学术资源', icon:'Scholar.png', enabled:true, createProxyGroup:true,
    proxiesOverride:['节点选择','手动切换','全球直连'],
    ruleEntries:[ ['geosite','category-scholar-!cn','学术资源'] ] },
  { key:'scholar-cn', name:'全球直连', icon:'Direct.png', enabled:true, createProxyGroup:false,
    ruleEntries:[ ['geosite','category-scholar-cn','全球直连'] ] },

  // 6) 加密货币
  { key:'crypto', name:'加密货币', icon:'Cryptocurrency_3.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','category-cryptocurrency','加密货币'], ['rule-set','crypto','加密货币'], ['rule-set','mining','加密货币'] ] },

  // 7) 平台生态
  { key:'apple', name:'Apple', icon:'Apple_2.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','apple@cn','全球直连'], ['geosite','apple','Apple'] ] },
  { key:'microsoft', name:'Microsoft', icon:'Microsoft.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','microsoft@cn','全球直连'], ['geosite','microsoft','Microsoft'] ] },
  { key:'google', name:'Google', icon:'Google_Search.png', enabled:true, createProxyGroup:true,
    ruleEntries:[ ['geosite','google','Google'], ['geoip','google','Google','no-resolve'] ] },

  // 8) 国家与私有域直连
  { key:'cn-domains', name:'全球直连', icon:'Direct.png', enabled:true, createProxyGroup:false,
    ruleEntries:[ ['geosite','cn','全球直连'], ['geosite','private','全球直连'] ] },
  { key:'cn-ip', name:'全球直连', icon:'Direct.png', enabled:true, createProxyGroup:false,
    ruleEntries:[ ['geoip','cn','全球直连','no-resolve'], ['geoip','lan','全球直连','no-resolve'], ['geoip','private','全球直连','no-resolve'] ] },
];

// ===== 动态生成：规则、分组、GLOBAL 注入（按数组顺序） =====
function buildFeatureRules() {
  const on = FEATURE_GROUPS.filter(g=>g.enabled);
  const out = [];
  for (const g of on) {
    for (const r of g.ruleEntries) {
      const [type,key,target,extra] = r;
      const t = type.toLowerCase();
      const k = String(key).toLowerCase();
      out.push(extra ? `${t},${k},${target},${extra}` : `${t},${k},${target}`);
    }
  }
  return out;
}
function buildFeatureProxyGroups(defaultProxies){
  const on = FEATURE_GROUPS.filter(g=>g.enabled && g.createProxyGroup);
  return on.map(g => ({
    name: g.name,
    icon: ICON(g.icon),
    type: 'select',
    proxies: Array.isArray(g.proxiesOverride) ? g.proxiesOverride : defaultProxies
  }));
}
function extendGlobalProxies(globalProxies){
  const on = FEATURE_GROUPS.filter(g=>g.enabled && g.createProxyGroup);
  for (const g of on) if (!globalProxies.includes(g.name)) insertAfter(globalProxies,'手动切换',g.name);
}

// ===== 国家识别与图标 =====
const countryRegex = {
  '香港': '(?i)香港|港|HK|hk|Hong Kong|HongKong|hongkong', '澳门':'(?i)澳门|MO|Macau',
  '台湾': '(?i)台|新北|彰化|TW|Taiwan', '新加坡':'(?i)新加坡|坡|狮城|SG|Singapore',
  '日本': '(?i)日本|川日|东京|大阪|泉日|埼玉|沪日|深日|JP|Japan', '韩国':'(?i)KR|Korea|KOR|首尔|韩|韓',
  '美国': '(?i)美国|美|US|United States', '加拿大':'(?i)加拿大|Canada|CA',
  '英国': '(?i)英国|United Kingdom|UK|伦敦|London', '澳大利亚':'(?i)澳洲|澳大利亚|AU|Australia',
  '德国': '(?i)德国|德|DE|Germany', '法国':'(?i)法国|法|FR|France',
  '俄罗斯': '(?i)俄罗斯|俄|RU|Russia', '泰国':'(?i)泰国|泰|TH|Thailand',
  '印度': '(?i)印度|IN|India', '马来西亚':'(?i)马来西亚|马来|MY|Malaysia'
};
const countryIconURLs = {
  '香港': ICON('Hong_Kong.png'), '台湾': ICON('Taiwan.png'), '新加坡': ICON('Singapore.png'),
  '日本': ICON('Japan.png'), '韩国': ICON('Korea.png'), '美国': ICON('United_States.png'),
  '英国': ICON('United_Kingdom.png'), '加拿大': ICON('Canada.png'), '澳大利亚': ICON('Australia.png'),
  '德国': ICON('Germany.png'), '俄罗斯': ICON('Russia.png'), '泰国': ICON('Thailand.png'),
  '印度': ICON('India.png'), '马来西亚': ICON('Malaysia.png'), '澳门': ICON('Macao.png'), '法国': ICON('France.png')
};
function parseCountries(config){
  const proxies = config.proxies || [];
  const res = [], seen = new Set();
  for (const [c, pat] of Object.entries(countryRegex)) {
    const r = makeRegex(pat);
    for (const p of proxies) {
      const n = p.name || '';
      if (r.test(n) && !isIspName(n) && !seen.has(c)) { seen.add(c); res.push(c); }
    }
  }
  return res;
}
function buildCountryProxyGroups(countryList){
  const groups = [];
  for (const c of countryList) {
    if (!countryRegex[c]) continue;
    const g = {
      name: `${c}节点`, icon: countryIconURLs[c],
      'include-all': true,
      filter: countryRegex[c],
      'exclude-filter': '(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地',
      type: loadBalance ? 'load-balance' : 'url-test'
    };
    if (!loadBalance) Object.assign(g, { interval:300, tolerance:20, lazy:false });
    groups.push(g);
  }
  return groups;
}

// ===== 其余配置 =====
const snifferConfig = { sniff:{ TLS:{ports:[443,8443],'override-destination':true}, HTTP:{ports:[80,8080,8880],'override-destination':false}, QUIC:{ports:[443,8443],'override-destination':true} }, enable:true, 'parse-pure-ip':true, 'force-dns-mapping':true, 'skip-domain':['Mijia Cloud','dlg.io.mi.com','+.push.apple.com'] };
const dnsConfigBase = { enable:true, ipv6:ipv6Enabled, 'prefer-h3':true, 'enhanced-mode':'fake-ip', 'fake-ip-range':'198.20.0.1/16', 'fake-ip-filter':['+.lan','+.local','+.drj028.com','geosite:cn','geosite:private','geosite:apple@cn','geosite:category-pt'], nameserver:['223.5.5.5'] };
const geoxURL = { geoip:`${CDN}/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat`, geosite:`${CDN}/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat`, mmdb:`${CDN}/gh/Loyalsoldier/geoip@release/Country.mmdb`, asn:`${CDN}/gh/Loyalsoldier/geoip@release/GeoLite2-ASN.mmdb` };

// ===== 规则拼装：由目录产出 + 末尾 match 固定 =====
function buildRules() {
  const list = buildFeatureRules();
  list.push('match,节点选择'); // 兜底，别动
  return list;
}

// ===== 代理组拼装 =====
function buildProxyGroups(countryList, countryProxyGroups, lowCost, defaults){
  const { defaultProxies, defaultSelector, defaultProxiesDirect, globalProxies } = defaults;

  // 扩展 GLOBAL 候选（按目录顺序注入）
  extendGlobalProxies(globalProxies);

  // 国家组名注入候选
  const countryProxies = [];
  for (const c of countryList) {
    const gname = `${c}节点`;
    if (!globalProxies.includes(gname)) globalProxies.push(gname);
    countryProxies.push(gname);
  }
  if (lowCost) {
    insertAfter(globalProxies,'自动选择','低倍率节点');
    countryProxies.push('低倍率节点');
  }
  defaultProxies.splice(1,0,...countryProxies);
  defaultSelector.splice(1,0,...countryProxies);
  defaultProxiesDirect.splice(2,0,...countryProxies);

  const groups = [
    { name:'节点选择', icon:ICON('Proxy.png'), type:'select', proxies: defaultSelector },
    landing ? { name:'落地节点', icon:ICON('Airport.png'), type:'select', 'include-all':true, filter:'(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地' } : null,
    landing ? { name:'前置代理', icon:ICON('Area.png'), type:'select', 'include-all':true, 'exclude-filter':'(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地', proxies: defaultSelector } : null,
    lowCost ? { name:'低倍率节点', icon:ICON('Lab.png'), type: loadBalance ? 'load-balance' : 'url-test', 'include-all':true, filter:'(?i)0\\.[0-5]|低倍率|省流|大流量|实验性' } : null,

    // 静态资源放前以免母集抢路由
    { name:'静态资源', icon:ICON('Cloudflare.png'), type:'select', proxies: defaultProxies },

    // 声明式业务分组（按目录顺序）
    ...buildFeatureProxyGroups(defaultProxies),

    // 直连、国家组与 GLOBAL
    { name:'全球直连', icon:ICON('Direct.png'), type:'select', proxies:['DIRECT','节点选择'] },
    ...countryProxyGroups,
    { name:'GLOBAL', icon:ICON('Global.png'), 'include-all':true, type:'select', proxies: globalProxies }
  ].filter(Boolean);

  return groups;
}

// ===== 主入口 =====
function main(config){
  const defaultProxies       = [...defaultProxiesBase];
  const defaultSelector      = [...defaultSelectorBase];
  const defaultProxiesDirect = [...defaultProxiesDirectBase];
  const globalProxies        = [...globalProxiesBase];
  const dnsConfig            = { ...dnsConfigBase, ipv6: ipv6Enabled };

  const countryList        = parseCountries(config);
  const lowCost            = (config.proxies||[]).some(p => isLowCostName(p.name||''));
  const countryGroups      = buildCountryProxyGroups(countryList);
  const proxyGroups        = buildProxyGroups(countryList, countryGroups, lowCost, { defaultProxies, defaultSelector, defaultProxiesDirect, globalProxies });

  const rules = buildRules();

  if (fullConfig) {
    Object.assign(config, {
      'mixed-port':7890,'redir-port':7892,'tproxy-port':7893,'routing-mark':7894,
      'allow-lan':true, ipv6:ipv6Enabled, mode:'rule','unified-delay':true,
      'tcp-concurrent':true,'find-process-mode':'off','log-level':'info',
      'geodata-loader':'standard','external-controller':':9999',
      'disable-keep-alive':!enableKeepAlive, profile:{'store-selected':true}
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
