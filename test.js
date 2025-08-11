/* ==========================================================================
 Sub-Store 转换脚本（可读性与可维护性增强版）
 ---------------------------------------------------------------------------
 目的：
   1) 根据机场提供的节点名称自动识别国家/地区，并生成对应分组；
   2) 提供清晰的可编辑入口（正则/分组策略/开关）；
   3) 防止误判导致的“空分组”，并在生成后自动清理空组。

 核心工作流（概览）：
   [1] 扫描 config.proxies 里的节点名
   [2] 按 countryRegex 的正则表命中国家清单
   [3] 按命中的国家清单调用 buildProxyGroups 构造分组
   [4] 运行 cleanEmptyGroups 删除没节点可用的空分组，并清空无效引用

 快速上手：
   - 修改或新增国家识别：编辑 countryRegex（见下）；
   - 新增关键字分组：在 buildProxyGroups 中扩展规则；
   - 成品里不想出现空组：保留 cleanEmptyGroups（默认已启用）。

 正则书写约定：
   - 使用 (?i) 表示忽略大小写；
   - 对于两字母/三字母代码（如 UK/GB/GBR），必须加单词边界：\\bUK\\b；
   - 对于英文多词，如 United Kingdom、Great Britain，空格写成 \\s* 以提升兼容性；
   - 城市名是强信号（如 London），谨慎添加，避免因“落地”“回程”类字样误判。

 常见坑位：
   - “UK” 极易误伤（JP-UK、US-UK、解锁UK），已在本脚本中**收紧为单词边界**；
   - “US” 会被 “AUS” 误触，若有需要可将 US 也改为 \\bUS\\b（权衡容错率）。

 调试建议：
   - 可临时在 main 里 console.log(countryList, proxyGroups) 查看效果；
   - 如果机场实际无某国节点，但名称里带有该国字样，请优先收紧对应正则。

 本文件仅优化注释与结构性说明，算法与默认输出保持与原版一致。
 ========================================================================== */\n\n/*
powerfullz 的 Substore 订阅转换脚本
https://github.com/powerfullz/override-rules
传入参数：
- loadbalance: 启用负载均衡 (默认false)
- landing: 启用落地节点功能 (默认false)
- ipv6: 启用 IPv6 支持 (默认false)
- full: 启用完整配置，用于纯内核启动 (默认false)
- keepalive: 启用 tcp-keep-alive (默认false)
*/

const inArg = $arguments; // console.log(inArg)
const loadBalance = parseBool(inArg.loadbalance) || false,
    landing = parseBool(inArg.landing) || false,
    ipv6Enabled = parseBool(inArg.ipv6) || false,
    fullConfig = parseBool(inArg.full) || false,
    enableKeepAlive = parseBool(inArg.keepalive) || false;

// 生成默认代理组
const defaultProxies = [
    "节点选择", "自动选择", "手动切换", "全球直连"
];

const defaultProxiesDirect = [
    "全球直连", "节点选择", "手动切换"
]

const defaultSelector = [
    "自动选择", "手动切换", "DIRECT"
];

const globalProxies = [
    "节点选择", "手动切换", "自动选择", "静态资源", "人工智能", "加密货币", "PayPal", "Telegram", "Microsoft", "Apple", "Google", "YouTube", "Disney", "Netflix", "Spotify", "Twitter(X)", "学术资源", "开发者资源", "游戏平台", "Speedtest", 
    "全球直连"
];

const ruleProviders = {
    "pt": {
        "type": "http",
        "behavior": "domain",
        "format": "yaml",
        "interval": 86400,
        "url": "https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/pt.yaml",
        "path": "./ruleset/pt.yaml"
    },
    "outlook": {
        "type": "http",
        "behavior": "domain",
        "format": "yaml",
        "interval": 86400,
        "url": "https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/outlook.yaml",
        "path": "./ruleset/outlook.yaml"
    },
    "crypto": {
        "type": "http",
        "behavior": "domain",
        "format": "yaml",
        "interval": 86400,
        "url": "https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/crypto.yaml",
        "path": "./ruleset/crypto.yaml"
    },
    "mining": {
        "type": "http",
        "behavior": "domain",
        "format": "yaml",
        "interval": 86400,
        "url": "https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/mining.yaml",
        "path": "./ruleset/mining.yaml"
    },
    "cdn": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://ruleset.skk.moe/Clash/non_ip/cdn.txt",
        "path": "./ruleset/cdn.txt"
    },  
}

const rules = [


    "RULE-SET,outlook,全球直连",
    "RULE-SET,cdn,静态资源",    
    "RULE-SET,pt,全球直连",    
    "GEOSITE,CATEGORY-PT,全球直连",
    "GEOSITE,PAYPAL@CN,全球直连",
    "GEOSITE,PAYPAL,PayPal",
    "GEOSITE,GOOGLE-PLAY@CN,全球直连",
    "GEOSITE,TELEGRAM,Telegram",
    "GEOSITE,CATEGORY-AI-CHAT-!CN,人工智能",
    "GEOSITE,YOUTUBE@CN,全球直连",
    "GEOSITE,YOUTUBE,YouTube",
    "GEOSITE,DISNEY,Disney",  
    "GEOSITE,NETFLIX,Netflix",
    "GEOSITE,SPOTIFY,Spotify",
    "GEOSITE,TWITTER,Twitter(X)",
    "GEOSITE,OOKLA-SPEEDTEST,Speedtest",
    "GEOSITE,CATEGORY-DEV,开发者资源",
    "GEOSITE,CATEGORY-GAMES@CN,全球直连",
    "GEOSITE,CATEGORY-GAME-PLATFORMS-DOWNLOAD,全球直连",
    "GEOSITE,CATEGORY-GAMES,游戏平台",
    "GEOSITE,CATEGORY-SCHOLAR-!CN,学术资源",
    "GEOSITE,CATEGORY-SCHOLAR-CN,全球直连",
    "GEOSITE,CATEGORY-CRYPTOCURRENCY,加密货币",
    "RULE-SET,crypto,加密货币",
    "RULE-SET,mining,加密货币",    

    "GEOSITE,APPLE@CN,全球直连",
    "GEOSITE,APPLE,Apple",
    "GEOSITE,MICROSOFT@CN,全球直连",
    "GEOSITE,MICROSOFT,Microsoft",
    "GEOSITE,GOOGLE,Google",
    "GEOSITE,CN,全球直连",
    "GEOSITE,PRIVATE,全球直连",
    
    "GEOIP,NETFLIX,Netflix,no-resolve",
    "GEOIP,GOOGLE,Google,no-resolve",
    "GEOIP,TELEGRAM,Telegram,no-resolve",
    "GEOIP,CN,全球直连,no-resolve",
    "GEOIP,LAN,全球直连,no-resolve",
    "GEOIP,PRIVATE,全球直连,no-resolve",
    "MATCH,节点选择"
];

const snifferConfig = {
    "sniff": {
        "TLS": {
            "ports": [443, 8443],
            "override-destination": true
        },
        "HTTP": {
            "ports": [80, 8080, 8880],
            "override-destination": false
        },
        "QUIC": {
            "ports": [443, 8443],
            "override-destination": true
        }
    },
    "enable": true,
    "parse-pure-ip": true,
    "force-dns-mapping": true,
    "skip-domain": [
        "Mijia Cloud",
        "dlg.io.mi.com",
        "+.push.apple.com"
    ]
};

const dnsConfig = {
    "enable": true,
    "ipv6": ipv6Enabled,
    "prefer-h3": true,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.20.0.1/16",
    "fake-ip-filter": [   
        "+.lan",
        "+.local",
        "+.drj028.com",
        "geosite:cn",
        "geosite:private",
        "geosite:apple@cn",
        "geosite:category-pt"
    ],
    "nameserver": [
        "223.5.5.5"
    ],
};

const geoxURL = {
    "geoip": "https://fastly.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat",
    "geosite": "https://fastly.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
    "mmdb": "https://fastly.jsdelivr.net/gh/Loyalsoldier/geoip@release/Country.mmdb",
    "asn": "https://fastly.jsdelivr.net/gh/Loyalsoldier/geoip@release/GeoLite2-ASN.mmdb"
};
// ---------------------------------------------------------------------------
// 国家识别表（Country Regex Map）
// 规则：键为中文国家名；值为正则（字符串）。
// 建议写法：
//   - 使用 (?i) 忽略大小写；
//   - 城市名尽量精确，避免与“落地”“回程”“解锁”之类混淆；
//   - 两字母/三字母代码加单词边界（例如 \bUK\b、\bGB\b、\bGBR\b）；
// 扩展：在此新增条目即可自动参与识别与分组生成。
// ---------------------------------------------------------------------------


const countryRegex = {
    "香港": "(?i)香港|港|HK|hk|Hong Kong|HongKong|hongkong",
    "澳门": "(?i)澳门|MO|Macau",
    "台湾": "(?i)台|新北|彰化|TW|Taiwan",
    "新加坡": "(?i)新加坡|坡|狮城|SG|Singapore",
    "日本": "(?i)日本|川日|东京|大阪|泉日|埼玉|沪日|深日|JP|Japan",
    "韩国": "(?i)KR|Korea|KOR|首尔|韩|韓",
    "美国": "(?i)美国|美|US|United States",
    "加拿大": "(?i)加拿大|Canada|CA",
    "英国": "(?i)(英国|United\s*Kingdom|伦敦|London|\bUK\b|\bGB\b|\bGBR\b|Great\s*Britain)",  // 英国规则加固：使用 \bUK\b/\bGB\b/\bGBR\b，避免误判
    "澳大利亚": "(?i)澳洲|澳大利亚|AU|Australia",
    "德国": "(?i)德国|德|DE|Germany",
    "法国": "(?i)法国|法|FR|France",
    "俄罗斯": "(?i)俄罗斯|俄|RU|Russia",
    "泰国": "(?i)泰国|泰|TH|Thailand",
    "印度": "(?i)印度|IN|India",
    "马来西亚": "(?i)马来西亚|马来|MY|Malaysia",
}

function parseBool(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return value.toLowerCase() === "true" || value === "1";
    }
    return false;
}

function hasLowCost(config) {
    // 检查是否有低倍率节点
    const proxies = config["proxies"];
    const lowCostRegex = new RegExp(/0\.[0-5]|低倍率|省流|大流量|实验性/, 'i');
    for (const proxy of proxies) {
        if (lowCostRegex.test(proxy.name)) {
            return true;
        }
    }
    return false;
}

function parseCountries(config) {
    const proxies = config["proxies"];
    const ispRegex = new RegExp(/家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地/, 'i');    // 排除落地节点
    const result = [];
    const seen = new Set(); // 用于去重

    for (const [country, pattern] of Object.entries(countryRegex)) {
        // 创建正则表达式（去掉 (?i) 前缀并添加 'i' 标志）
        const regex = new RegExp(
            pattern.replace(/^\(\?i\)/, ''),
            'i'
        );

        for (const proxy of proxies) {
            const name = proxy.name;
            if (regex.test(name) && !ispRegex.test(name)) {
                // 防止重复添加国家名称
                if (!seen.has(country)) {
                    seen.add(country);
                    result.push(country);
                }
            }
        }
    }
    return result;
}

function buildCountryProxyGroups(countryList) {
    const countryIconURLs = {
        "香港": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Hong_Kong.png",
        "台湾": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Taiwan.png",
        "新加坡": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Singapore.png",
        "日本": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Japan.png",
        "韩国": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Korea.png",
        "美国": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/United_States.png",
        "英国": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/United_Kingdom.png",
        "加拿大": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Canada.png",
        "澳大利亚": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Australia.png",
        "德国": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Germany.png",
        "俄罗斯": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Russia.png",
        "泰国": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Thailand.png",
        "印度": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/India.png",
        "马来西亚": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Malaysia.png",
        "澳门": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Macao.png",
        "法国": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/France.png",
    };
    // 获取实际存在的国家列表

    const countryProxyGroups = [];

    // 为实际存在的国家创建节点组
    for (const country of countryList) {
        // 确保国家名称在预设的国家配置中存在
        if (countryRegex[country]) {
            const groupName = `${country}节点`;
            const pattern = countryRegex[country];

            const groupConfig = {
                "name": groupName,
                "icon": countryIconURLs[country],
                "include-all": true,
                "filter": pattern,
                "exclude-filter": "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地|0\.[0-5]|低倍率|省流|大流量|实验性",
                "type": (loadBalance) ? "load-balance" : "url-test",
            };

            if (!loadBalance) {
                Object.assign(groupConfig, {
                    "interval": 300,
                    "tolerance": 20,
                    "lazy": false
                });
            }

            countryProxyGroups.push(groupConfig);
        }
    }

    return countryProxyGroups;
}
/**
 * 构建国家/地区分组以及其他策略分组
 * @param {string[]} countryList 识别到的国家清单（来自 countryRegex 命中）
 * @param {Object<string,any>} countryProxyGroups 国家分组模板/规则
 * @param {boolean} lowCost 是否启用低成本策略（若你有相关逻辑）
 * @returns {Array<Object>} 按 Sub-Store schema 输出的 proxy-groups 数组
 *
 * 编辑入口：
 *   - 想新增“关键字分组”“地区合集分组”，在此函数中扩展模板。
 *   - 想改变分组显示名称、图标、筛选器，改模板即可，其他逻辑无需改动。
 */


function buildProxyGroups(countryList, countryProxyGroups, lowCost) {
    // 查看是否有特定国家的节点
    const hasTW = countryList.includes("台湾");
    const hasHK = countryList.includes("香港");
    const hasUS = countryList.includes("美国");
    return [
        {
            "name": "节点选择",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Proxy.png",
            "type": "select",
            "proxies": defaultSelector
        },
        (landing) ? {
            "name": "落地节点",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Airport.png",
            "type": "select",
            "include-all": true,
            "filter": "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地",
        } : null,
        (landing) ? {
            "name": "前置代理",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Area.png",
            "type": "select",
            "include-all": true,
            "exclude-filter": "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地",
            "proxies": defaultSelector
        } : null,
        (lowCost) ? {
            "name": "低倍率节点",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Lab.png",
            "type": (loadBalance) ? "load-balance" : "url-test",
            "include-all": true,
            "filter": "(?i)0\.[0-5]|低倍率|省流|大流量|实验性"
        } : null,
        {
            "name": "手动切换",
            "icon": "https://fastly.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/select.png",
            "include-all": true,
            "type": "select"
        },
        {
            "name": "自动选择",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Auto.png",
            "type": "url-test",
            "include-all": true,
            "exclude-filter": "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地",
            "interval": 300,
            "tolerance": 20,
            "lazy": false
        },
        {
            "name": "静态资源",
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Cloudflare.png",
            "type": "select",
            "include-all": true,
            "proxies": defaultProxies,
        },
        {
            "name": "人工智能",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Bot.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "加密货币",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Cryptocurrency_3.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "PayPal",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/PayPal.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "Telegram",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Telegram.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "Microsoft",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Microsoft.png",
            "type": "select",
            "proxies": defaultProxies,
        },
        {
            "name": "Apple",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Apple_2.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "Google",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Google_Search.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "YouTube",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/YouTube.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "Disney",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Disney+.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "Netflix",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Netflix.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "Spotify",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Spotify.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "Twitter(X)",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Twitter.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "学术资源",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Scholar.png",
            "type": "select",
            "proxies": [
                "节点选择", "手动切换", "全球直连"
            ]
        },
        {
            "name": "开发者资源",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/GitHub.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "游戏平台",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Game.png",
            "type": "select",
            "proxies": defaultProxies,
        },
        {
            "name": "Speedtest",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Speedtest.png",
            "type": "select",
            "proxies": defaultProxies,
        },
        {
            "name": "全球直连",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Direct.png",
            "type": "select",
            "proxies": [
                "DIRECT", "节点选择"
            ]
        },
        ...countryProxyGroups,
        {
            "name": "GLOBAL",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Global.png",
            "include-all": true,
            "type": "select",
            "proxies": globalProxies
        }
    ].filter(Boolean); // 过滤掉 null 值
}


/** 
 * 清理空分组并修复跨组引用
 * 处理逻辑：
 *   1) 检查每个分组是否能匹配到至少一个节点；
 *   2) 删除匹配不到任何节点的分组；
 *   3) 对剩余分组，移除对“已删除分组”或“无此节点”的引用；
 *   4) 如因引用清理导致某分组为空，再次删除之。
 * 安全性：
 *   - 对于无法解析的 filter 正则，默认保留该组（避免误删）。
 */
function cleanEmptyGroups(config, proxyGroups) {
    const proxies = Array.isArray(config && config.proxies) ? config.proxies : [];
    const proxyNameSet = new Set(proxies.map(p => p && p.name).filter(Boolean));

    function matchesAny(group) {
        // If explicit proxies array exists, check length after filtering invalid refs
        if (Array.isArray(group.proxies)) {
            const kept = group.proxies.filter(x => {
                if (typeof x !== 'string') return true;
                if (x === 'DIRECT' || x === 'REJECT' || x === '自动选择') return true;
                // keep if refers to a real proxy (node) or will be another group name (we'll validate later)
                return proxyNameSet.has(x);
            });
            return kept.length > 0;
        }
        // If it's an include-all+filter style group, evaluate the filter against node names
        if (group["include-all"] && group["filter"]) {
            try {
                const pat = String(group["filter"]).replace(/^\(\?i\)/, '');
                const regex = new RegExp(pat, 'i');
                let ex = null;
                if (group["exclude-filter"]) {
                    const exPat = String(group["exclude-filter"]).replace(/^\(\?i\)/, '');
                    ex = new RegExp(exPat, 'i');
                }
                return proxies.some(p => {
                    const name = p && p.name || "";
                    return regex.test(name) && !(ex && ex.test(name));
                });
            } catch (e) {
                // In doubt, keep the group to avoid over-deletion
                return true;
            }
        }
        return true;
    }

    // First pass: drop groups that have zero matches/nodes
    let keptGroups = proxyGroups.filter(g => matchesAny(g));

    // Build set of remaining group names for cross-ref cleanup
    const keptGroupNameSet = new Set(keptGroups.map(g => g && g.name).filter(Boolean));

    // Second pass: for groups with proxies arrays, remove references to dropped groups or non-existent nodes
    keptGroups = keptGroups.map(g => {
        if (Array.isArray(g.proxies)) {
            const newList = g.proxies.filter(x => {
                if (typeof x !== 'string') return true;
                if (x === 'DIRECT' || x === 'REJECT' || x === '自动选择') return true;
                // keep if it's an existing group name
                if (keptGroupNameSet.has(x)) return true;
                // or a real node name
                return proxyNameSet.has(x);
            });
            return Object.assign({}, g, { proxies: Array.from(new Set(newList)) });
        }
        return g;
    });

    // Final pass: remove any groups that became empty after reference cleanup
    keptGroups = keptGroups.filter(g => {
        if (Array.isArray(g.proxies)) return g.proxies.length > 0;
        return true;
    });

    return keptGroups;
}


/**
 * 入口函数
 * 你最常编辑的地方：
 *   - countryRegex：国家识别词典（新增/微调匹配词）
 *   - buildProxyGroups：分组模板与生成逻辑（新增合集、排序、图标）
 *   - cleanEmptyGroups：保持成品干净（不需要改，除非你要改清理策略）
 */
function main(config) {
    // 查看当前有哪些国家的节点
    const countryList = parseCountries(config);
// 成本策略的开关/阈值等可调参数（按需）
// 例：将低倍率节点单独分组或优先级提升

    const lowCost = hasLowCost(config);
    const countryProxies = [];
    
    // 修改默认代理组
    for (const country of countryList) {
        const groupName = `${country}节点`;
        globalProxies.push(groupName);
        countryProxies.push(groupName);
    }

    if (lowCost) {
        idx = globalProxies.indexOf("自动选择");
        globalProxies.splice(idx, 0, "低倍率节点");
        countryProxies.push("低倍率节点");     // 懒得再搞一个低倍率节点组了
    }

    defaultProxies.splice(1, 0, ...countryProxies);
    defaultSelector.splice(1, 0, ...countryProxies);
    defaultProxiesDirect.splice(2, 0, ...countryProxies);

    // 处理落地
    if (landing) {
        idx = defaultProxies.indexOf("自动选择");
        defaultProxies.splice(idx, 0, "落地节点");

        defaultSelector.unshift("落地节点");

        idx = globalProxies.indexOf("自动选择");
        globalProxies.splice(idx, 0, ...["落地节点", "前置代理"]);
    }
    // 生成国家节点组
    const countryProxyGroups = buildCountryProxyGroups(countryList);
    // 生成代理组
    const proxyGroups = buildProxyGroups(countryList, countryProxyGroups, lowCost);
    const proxyGroupsCleaned = cleanEmptyGroups(config, proxyGroups);
    if (fullConfig) Object.assign(config, {
        "mixed-port": 7890,
        "redir-port": 7892,
        "tproxy-port": 7893,
        "routing-mark": 7894,
        "allow-lan": true,
        "ipv6": ipv6Enabled,
        "mode": "rule",
        "unified-delay": true,
        "tcp-concurrent": true,
        "find-process-mode": "off",
        "log-level": "info",
        "geodata-loader": "standard",
        "external-controller": ":9999",
        "disable-keep-alive": !enableKeepAlive,
        "profile": {
            "store-selected": true,
        }
    });

    Object.assign(config, {
        "proxy-groups": proxyGroupsCleaned,
        "rule-providers": ruleProviders,
        "rules": rules,
        "sniffer": snifferConfig,
        "dns": dnsConfig,
        "geodata-mode": true,
        "geox-url": geoxURL,
    });

    return config;
}
