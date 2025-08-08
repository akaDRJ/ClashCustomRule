/*
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
    "节点选择", "手动切换", "自动选择", "人工智能", "加密货币", "PayPal", "Telegram", "Microsoft", "Apple", "Google", "YouTube", "Disney", "Netflix", "Spotify", "Twitter(X)", "学术资源", "开发者资源", "游戏平台", "Speedtest", 
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
    }  
}

const rules = [
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
    "RULE-SET,pt,全球直连",
    "RULE-SET,outlook,全球直连",

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
    "enhanced-mode": "fake-ip",      // 与 mihomo YAML 保持一致
    "fake-ip-range": "198.20.0.1/16",// 原配置里的 /16 池
    "fake-ip-filter": [              // 原有过滤列表
        "+.lan",
        "+.local",
        "+.drj028.com",
        "geosite:cn",
        "geosite:private",
        "geosite:apple@cn",
        "geosite:zoom",
        "geosite:category-pt"
    ],
    "nameserver": [                  // 主解析服务器
        "223.5.5.5"
    ],
};

const geoxURL = {
    "geoip": "https://fastly.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat",
    "geosite": "https://fastly.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
    "mmdb": "https://fastly.jsdelivr.net/gh/Loyalsoldier/geoip@release/Country.mmdb",
    "asn": "https://fastly.jsdelivr.net/gh/Loyalsoldier/geoip@release/GeoLite2-ASN.mmdb"
};

const countryRegex = {
    "香港": "(?i)香港|港|HK|hk|Hong Kong|HongKong|hongkong",
    "澳门": "(?i)澳门|MO|Macau",
    "台湾": "(?i)台|新北|彰化|TW|Taiwan",
    "新加坡": "(?i)新加坡|坡|狮城|SG|Singapore",
    "日本": "(?i)日本|川日|东京|大阪|泉日|埼玉|沪日|深日|JP|Japan",
    "韩国": "(?i)KR|Korea|KOR|首尔|韩|韓",
    "美国": "(?i)美国|美|US|United States",
    "加拿大": "(?i)加拿大|Canada|CA",
    "英国": "(?i)英国|United Kingdom|UK|伦敦|London",
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

function main(config) {
    // 查看当前有哪些国家的节点
    const countryList = parseCountries(config);
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
        "proxy-groups": proxyGroups,
        "rule-providers": ruleProviders,
        "rules": rules,
        "sniffer": snifferConfig,
        "dns": dnsConfig,
        "geodata-mode": true,
        "geox-url": geoxURL,
    });

    return config;
}
