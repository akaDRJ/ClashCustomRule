


const TUNING = {
  MIN_NODES_PER_COUNTRY: 2,          
  ENABLE_EMPTY_GROUP_CLEANUP: true,  
  DEBUG_REPORT: false,               
  WORD_BOUNDARY_FOR_ISO2: true       
};

\n\n

const inArg = $arguments; 
const loadBalance = parseBool(inArg.loadbalance) || false,
    landing = parseBool(inArg.landing) || false,
    ipv6Enabled = parseBool(inArg.ipv6) || false,
    fullConfig = parseBool(inArg.full) || false,
    enableKeepAlive = parseBool(inArg.keepalive) || false;


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
    }  
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
    ]
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
    "英国": "(?i)(英国|United\s*Kingdom|伦敦|London|\bUK\b|\bGB\b|\bGBR\b|Great\s*Britain)",  
    "澳大利亚": "(?i)澳洲|澳大利亚|AU|Australia",
    "德国": "(?i)德国|德|DE|Germany",
    "法国": "(?i)法国|法|FR|France",
    "俄罗斯": "(?i)俄罗斯|俄|RU|Russia",
    "泰国": "(?i)泰国|泰|TH|Thailand",
    "印度": "(?i)印度|IN|India",
    "马来西亚": "(?i)马来西亚|马来|MY|Malaysia"
}

function parseBool(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return value.toLowerCase() === "true" || value === "1";
    }
    return false;
}

function hasLowCost(config) {
    
    const proxies = config["proxies"];
    const lowCostRegex = new RegExp(/0\.[0-5]|低倍率|省流|大流量|实验性/, 'i');
    for (const proxy of proxies) {
        if (lowCostRegex.test(proxy.name)) {
            return true;
        }
    }
    return false;
}



function flagToISO2(flag) {
    if (!flag) return null;
    
    const codes = [];
    for (const ch of Array.from(flag)) {
        const cp = ch.codePointAt(0);
        
        if (cp >= 0x1F1E6 && cp <= 0x1F1FF) {
            const A = 0x1F1E6;
            const letter = String.fromCharCode(65 + (cp - A)); 
            codes.push(letter);
        }
    }
    if (codes.length === 2) return codes.join('');
    return null;
}

const ISO2_TO_CN = {
  "HK": "香港",
  "MO": "澳门",
  "TW": "台湾",
  "SG": "新加坡",
  "JP": "日本",
  "KR": "韩国",
  "US": "美国",
  "CA": "加拿大",
  "GB": "英国",
  "AU": "澳大利亚",
  "DE": "德国",
  "FR": "法国",
  "RU": "俄罗斯",
  "TH": "泰国",
  "IN": "印度",
  "MY": "马来西亚"
};


const NEG_SIGNALS = {
  "英国": /(JP|US|HK|SG|TW)[\-\s_]*UK|UK[\-\s_]*(落地|回程|解锁)/i
};

function parseCountries(config) {
    const proxies = config["proxies"];
    const ispRegex = new RegExp(/家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地/, 'i');    
    const result = [];
    const seen = new Set(); 

    
    const counts = Object.create(null);

    
    for (const proxy of proxies) {
        const name = proxy && proxy.name || "";
        if (!name || ispRegex.test(name)) continue;
        const iso2 = flagToISO2(name);
        if (iso2 && ISO2_TO_CN[iso2] && countryRegex[ISO2_TO_CN[iso2]]) {
            const cn = ISO2_TO_CN[iso2];
            counts[cn] = (counts[cn] || 0) + 1;
        }
    }

    
    for (const [country, pattern] of Object.entries(countryRegex)) {
        const regex = new RegExp(String(pattern).replace(/^\(\?i\)/, ''), 'i');
        const neg = NEG_SIGNALS[country] || null;

        for (const proxy of proxies) {
            const name = proxy && proxy.name || "";
            if (!name || ispRegex.test(name)) continue;

            if (regex.test(name)) {
                if (neg && neg.test(name)) {
                    
                    continue;
                }
                counts[country] = (counts[country] || 0) + 1;
            }
        }
    }

    
    const beforeList = Object.keys(counts).sort();
    for (const [country, n] of Object.entries(counts)) {
        if (n >= (TUNING.MIN_NODES_PER_COUNTRY || 1) && !seen.has(country)) {
            seen.add(country);
            result.push(country);
        }
    }

    
    if (TUNING.DEBUG_REPORT) {
        config.__debug = config.__debug || {};
        config.__debug.countryCounts = counts;
        config.__debug.countriesBeforeThreshold = beforeList;
        config.__debug.countriesAfterThreshold = result.slice();
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
        "法国": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/France.png"
    };
    

    const countryProxyGroups = [];

    
    for (const country of countryList) {
        
        if (countryRegex[country]) {
            const groupName = `${country}节点`;
            const pattern = countryRegex[country];

            const groupConfig = {
                "name": groupName,
                "icon": countryIconURLs[country],
                "include-all": true,
                "filter": pattern,
                "exclude-filter": "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地|0\.[0-5]|低倍率|省流|大流量|实验性",
                "type": (loadBalance) ? "load-balance" : "url-test"
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
            "filter": "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地"
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
            "proxies": defaultProxies
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
            "proxies": defaultProxies
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
            "proxies": defaultProxies
        },
        {
            "name": "Speedtest",
            "icon": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Speedtest.png",
            "type": "select",
            "proxies": defaultProxies
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
    ].filter(Boolean); 
}



function cleanEmptyGroups(config, proxyGroups) {
    const proxies = Array.isArray(config && config.proxies) ? config.proxies : [];
    const proxyNameSet = new Set(proxies.map(p => p && p.name).filter(Boolean));

    function matchesAny(group) {
        
        if (Array.isArray(group.proxies)) {
            const kept = group.proxies.filter(x => {
                if (typeof x !== 'string') return true;
                if (x === 'DIRECT' || x === 'REJECT' || x === '自动选择') return true;
                
                return proxyNameSet.has(x);
            });
            return kept.length > 0;
        }
        
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
                
                return true;
            }
        }
        return true;
    }

    
    let keptGroups = proxyGroups.filter(g => matchesAny(g));

    
    const keptGroupNameSet = new Set(keptGroups.map(g => g && g.name).filter(Boolean));

    
    keptGroups = keptGroups.map(g => {
        if (Array.isArray(g.proxies)) {
            const newList = g.proxies.filter(x => {
                if (typeof x !== 'string') return true;
                if (x === 'DIRECT' || x === 'REJECT' || x === '自动选择') return true;
                
                if (keptGroupNameSet.has(x)) return true;
                
                return proxyNameSet.has(x);
            });
            return Object.assign({}, g, { proxies: Array.from(new Set(newList)) });
        }
        return g;
    });

    
    keptGroups = keptGroups.filter(g => {
        if (Array.isArray(g.proxies)) return g.proxies.length > 0;
        return true;
    });

    return keptGroups;
}



function main(config) {
    
    const countryList = parseCountries(config);



    const lowCost = hasLowCost(config);
    const countryProxies = [];
    
    
    for (const country of countryList) {
        const groupName = `${country}节点`;
        globalProxies.push(groupName);
        countryProxies.push(groupName);
    }

    if (lowCost) {
        idx = globalProxies.indexOf("自动选择");
        globalProxies.splice(idx, 0, "低倍率节点");
        countryProxies.push("低倍率节点");     
    }

    defaultProxies.splice(1, 0, ...countryProxies);
    defaultSelector.splice(1, 0, ...countryProxies);
    defaultProxiesDirect.splice(2, 0, ...countryProxies);

    
    if (landing) {
        idx = defaultProxies.indexOf("自动选择");
        defaultProxies.splice(idx, 0, "落地节点");

        defaultSelector.unshift("落地节点");

        idx = globalProxies.indexOf("自动选择");
        globalProxies.splice(idx, 0, ...["落地节点", "前置代理"]);
    }
    
    const countryProxyGroups = buildCountryProxyGroups(countryList);
    
    const proxyGroups = buildProxyGroups(countryList, countryProxyGroups, lowCost);
    const proxyGroupsCleaned = TUNING.ENABLE_EMPTY_GROUP_CLEANUP ? cleanEmptyGroups(config, proxyGroups) : proxyGroups;
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
            "store-selected": true
        }
    });

    Object.assign(config, {
        "proxy-groups": proxyGroupsCleaned,
        "rule-providers": ruleProviders,
        "rules": rules,
        "sniffer": snifferConfig,
        "dns": dnsConfig,
        "geodata-mode": true,
        "geox-url": geoxURL
    });

    return config;
}