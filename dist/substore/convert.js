/**
 * convert.js - Sub-Store 配置转换脚本
 * 功能：将订阅转换为完整 Clash/Mihomo 配置文件
 *
 * 核心特性：
 * - 自动生成国家/地区分组（支持正则运行时匹配或枚举节点名）
 * - 内置完整规则集（强制直连/代理、微软服务、流媒体、加密货币等）
 * - 支持落地节点、低倍率节点、负载均衡等高级分组
 * - 统一 MRS 格式规则源，支持 QUIC 控制
 *
 * ==================== 运行参数 ====================
 *
 * [loadbalance]    使用负载均衡模式（默认 url-test）
 *                  开启后国家组使用 load-balance，否则使用 url-test
 *
 * [smart]          使用 Smart 策略替代 url-test
 *                  开启后自动选择、国家组、低倍率组使用 smart
 *                  loadbalance=true 时国家组和低倍率组仍使用 load-balance
 *
 * [landing]        启用落地节点支持
 *                  按国家添加「台湾落地」「新加坡落地」等分组（匹配 ISP／落地关键词）
 *                  添加「前置代理」分组（自动选择排除 ISP 的节点）
 *
 * [ipv6]           启用 IPv6 支持（默认关闭）
 *                  影响 DNS 配置和全局 ipv6 开关
 *
 * [full]           输出完整配置（包含端口、TUN、日志等基础配置）
 *                  默认仅输出 proxy-groups、rules、rule-providers、dns、sniffer
 *                  完整配置默认使用保守参数：tcp-concurrent=false、
 *                  disable-keep-alive=false、DNS prefer-h3=false、
 *                  sniffer 不覆写 TLS/QUIC 目的地址
 *
 * [tcpconcurrent]  显式覆盖 tcp-concurrent（默认 false）
 *
 * [aggressive]     启用旧激进模式：tcp-concurrent=true、DNS prefer-h3=true、
 *                  sniffer 覆写 TLS/QUIC 目的地址；仅建议临时 A/B 测试
 *
 * [quic]           启用 QUIC 支持（默认关闭，即阻止 QUIC）
 *                  关闭时：仅拦截命中代理策略的 UDP 443，保留直连例外
 *                  开启时：不添加 QUIC 阻止规则
 *
 * [regex]          使用正则运行时匹配模式（默认 false，使用枚举模式）
 *                  false：国家组使用 proxies 列表枚举具体节点名
 *                  true：国家组使用 include-all + filter + exclude-filter 正则匹配
 *                       低倍率组同样使用正则匹配；落地组枚举节点以保证兜底顺序
 *
 * [akcdnfallback]  启用 IX 手动选择组（默认关闭，沿用现有参数名）
 *                  「IX节点」仅枚举台湾和新加坡 IX，不包含落地或自动选择兜底
 *                  「前置代理」会收敛为独立机场中转分组，避免再走 AKCDN/落地自环
 *                  开启后会自动启用落地/前置代理分组，避免 dialer 节点悬空
 *
 * [android]        面向 Android TUN 客户端；省略仅 Linux 可用的 routing-mark
 *                  避免 Android 无对应 fwmark 路由表时核心出站不可达
 *
 * ==================== 使用示例 ====================
 *
 * 基础转换（默认配置，阻止 QUIC，枚举节点）：
 * https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert.js
 *
 * 完整配置 + 落地节点 + 负载均衡 + 正则模式：
 * https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert.js#full=true&landing=true&loadbalance=true&regex=true
 *
 * Smart 策略 + 正则模式：
 * https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert.js#smart=true&regex=true
 *
 * 启用 QUIC + IPv6：
 * https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert.js#quic=true&ipv6=true
 *
 * 台湾／新加坡 IX 手动选择 + 分国落地：
 * https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert.js#akcdnfallback=true&landing=true
 *
 * ==================== 导出接口 ====================
 *
 * 本脚本导出以下接口供其他脚本调用：
 * - main(config): 主入口，接收代理配置返回完整配置；生成失败时直接抛错
 * - metadata: { rules, ruleProviders, countryRegex } 元数据对象
 *
 * 被 sync-drjcustomrule-3.js 和 build-configs.js 依赖
 */

// ======================== 运行参数 ========================
const runtimeArgs =
  typeof $arguments === 'object' && $arguments !== null ? $arguments : {};

const useAggressiveDefaults = parseBool(runtimeArgs.aggressive);

const options = Object.freeze({
  loadBalance: parseBool(runtimeArgs.loadbalance),
  smartStrategy: parseBool(runtimeArgs.smart),
  landing: parseBool(runtimeArgs.landing),
  ipv6Enabled: parseBool(runtimeArgs.ipv6),
  fullConfig: parseBool(runtimeArgs.full),
  useAggressiveDefaults,
  quicEnabled: parseBool(runtimeArgs.quic),
  regexFilter: parseBool(runtimeArgs.regex),
  akcdnFallback: parseBool(runtimeArgs.akcdnfallback),
  android: parseBool(runtimeArgs.android)
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
  'rule-set,me2cloud,DIRECT',
  'geosite,private,全球直连',
  'geoip,private,全球直连,no-resolve',
  'rule-set,forcedirect,全球直连',
  'rule-set,forceproxy,强制代理',
  'rule-set,ai,人工智能',
  'rule-set,outlook,全球直连',
  'rule-set,pt,全球直连',
  'geosite,category-pt,全球直连',
  'geosite,google-play,Google',
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
  'geosite,category-ai-chat-!cn,人工智能',
  'geosite,category-dev,开发者资源',
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
  'geosite,googlefcm,全球直连',
  'geosite,google,Google',
  'geosite,cn,全球直连',
  'rule-set,cnsite,全球直连',

  'geoip,netflix,Netflix,no-resolve',
  'geoip,google,Google,no-resolve',
  'geoip,telegram,Telegram,no-resolve',
  'geoip,cn,全球直连,no-resolve',
  'match,节点选择'
];

function buildRules(quicEnabled) {
  return rules.flatMap((rule) => {
    const [kind, value, policy, ...extra] = rule.split(',');
    if (quicEnabled || policy === '全球直连' || policy === 'DIRECT') return [rule];
    const matcher = kind === 'match' ? '' : `,(${[kind, value, ...extra].join(',')})`;
    return [`AND,((DST-PORT,443),(NETWORK,UDP)${matcher}),REJECT`, rule];
  });
}

// ======================= 统一资源与图标 =======================
const CDN = 'https://gcore.jsdelivr.net';
const QURE_REF = 'b16b260625f873266f6a6a9b88710132774997b8';
const ICON = (path) => `${CDN}/gh/Koolson/Qure@${QURE_REF}/IconSet/Color/${path}`;
const GEOX_CDN = 'https://cdn.jsdelivr.net';

// ================= rule-providers（工厂） =================
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

const ruleProviders = {
  me2cloud: {
    type: 'http',
    behavior: 'classical',
    format: 'yaml',
    url: 'https://m2c.1ms.dog/rules/clash.yaml',
    path: './ruleset/me2cloud.yaml',
    interval: 86400
  },
  outlook: mrsProvider(
    'outlook',
    'raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/mrs/outlook.mrs'
  ),
  pt: mrsProvider(
    'pt',
    'raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/mrs/pt.mrs'
  ),
  crypto: mrsProvider(
    'crypto',
    'raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/mrs/crypto.mrs'
  ),
  mining: mrsProvider(
    'mining',
    'raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/mrs/mining.mrs'
  ),
  forceproxy: mrsProvider(
    'forceproxy',
    'raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/mrs/forceproxy.mrs'
  ),
  ai: mrsProvider(
    'ai',
    'raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/mrs/ai.mrs'
  ),
  forcedirect: mrsProvider(
    'forcedirect',
    'raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/mrs/forcedirect.mrs'
  ),
  fakeipfilter: mrsProvider(
    'fakeipfilter',
    'github.com/DustinWin/ruleset_geodata/releases/download/mihomo-ruleset/fakeip-filter.mrs'
  ),
  cnsite: mrsProvider(
    'cnsite',
    'github.com/DustinWin/ruleset_geodata/releases/download/mihomo-ruleset/cn.mrs'
  )
};

// ======================== 其余配置 ========================
const snifferConfigBase = {
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
  'cache-algorithm': 'arc',
  ipv6: options.ipv6Enabled,
  'prefer-h3': true,
  'enhanced-mode': 'fake-ip',
  'fake-ip-range': '198.18.0.1/16',
  'fake-ip-filter': [
    '+.drj028.com',
    'geosite:cn',
    'rule-set:cnsite',
    'rule-set:fakeipfilter',
    // me2cloud endpoints must resolve to real IPs for direct connectivity tests.
    'dynamodb.us-east-1.amazonaws.com',
    'dynamodb.us-east-1.api.aws',
    'dynamodb.us-east-2.amazonaws.com',
    'dynamodb.us-east-2.api.aws',
    'dynamodb.us-west-1.amazonaws.com',
    'dynamodb.us-west-1.api.aws',
    'dynamodb.us-west-2.amazonaws.com',
    'dynamodb.us-west-2.api.aws',
    'dynamodb.ca-central-1.amazonaws.com',
    'dynamodb.ca-central-1.api.aws',
    'dynamodb.ca-west-1.amazonaws.com',
    'dynamodb.ca-west-1.api.aws',
    'dynamodb.mx-central-1.amazonaws.com',
    'dynamodb.mx-central-1.api.aws',
    'dynamodb.sa-east-1.amazonaws.com',
    'dynamodb.sa-east-1.api.aws',
    'dynamodb.eu-central-1.amazonaws.com',
    'dynamodb.eu-central-1.api.aws',
    'dynamodb.eu-central-2.amazonaws.com',
    'dynamodb.eu-central-2.api.aws',
    'dynamodb.eu-west-1.amazonaws.com',
    'dynamodb.eu-west-1.api.aws',
    'dynamodb.eu-west-2.amazonaws.com',
    'dynamodb.eu-west-2.api.aws',
    'dynamodb.eu-west-3.amazonaws.com',
    'dynamodb.eu-west-3.api.aws',
    'dynamodb.eu-north-1.amazonaws.com',
    'dynamodb.eu-north-1.api.aws',
    'dynamodb.eu-south-1.amazonaws.com',
    'dynamodb.eu-south-1.api.aws',
    'dynamodb.eu-south-2.amazonaws.com',
    'dynamodb.eu-south-2.api.aws',
    'dynamodb.il-central-1.amazonaws.com',
    'dynamodb.il-central-1.api.aws',
    'dynamodb.me-central-1.amazonaws.com',
    'dynamodb.af-south-1.amazonaws.com',
    'dynamodb.af-south-1.api.aws',
    'dynamodb.ap-east-1.amazonaws.com',
    'dynamodb.ap-east-1.api.aws',
    'dynamodb.ap-east-2.amazonaws.com',
    'dynamodb.ap-east-2.api.aws',
    'dynamodb.ap-northeast-1.amazonaws.com',
    'dynamodb.ap-northeast-1.api.aws',
    'dynamodb.ap-northeast-2.amazonaws.com',
    'dynamodb.ap-northeast-2.api.aws',
    'dynamodb.ap-northeast-3.amazonaws.com',
    'dynamodb.ap-northeast-3.api.aws',
    'dynamodb.ap-south-1.amazonaws.com',
    'dynamodb.ap-south-1.api.aws',
    'dynamodb.ap-south-2.amazonaws.com',
    'dynamodb.ap-south-2.api.aws',
    'dynamodb.ap-southeast-1.amazonaws.com',
    'dynamodb.ap-southeast-1.api.aws',
    'dynamodb.ap-southeast-2.amazonaws.com',
    'dynamodb.ap-southeast-2.api.aws',
    'dynamodb.ap-southeast-3.amazonaws.com',
    'dynamodb.ap-southeast-3.api.aws',
    'dynamodb.ap-southeast-4.amazonaws.com',
    'dynamodb.ap-southeast-4.api.aws',
    'dynamodb.ap-southeast-5.amazonaws.com',
    'dynamodb.ap-southeast-5.api.aws',
    'dynamodb.ap-southeast-6.amazonaws.com',
    'dynamodb.ap-southeast-6.api.aws',
    'dynamodb.ap-southeast-7.amazonaws.com',
    'dynamodb.ap-southeast-7.api.aws',
    'dynamodb.cn-north-1.amazonaws.com.cn',
    'dynamodb.cn-northwest-1.amazonaws.com.cn',
    'dynamodb.me-west-1.amazonaws.com',
    'dynamodb.sa-west-1.amazonaws.com',
    'objectstorage.mx-monterrey-1.oraclecloud.com',
    'objectstorage.ca-toronto-1.oraclecloud.com',
    'objectstorage.eu-madrid-1.oraclecloud.com',
    'objectstorage.me-abudhabi-1.oraclecloud.com',
    'objectstorage.af-casablanca-1.oraclecloud.com',
    'objectstorage.ap-seoul-1.oraclecloud.com',
    'objectstorage.ap-osaka-1.oraclecloud.com',
    'objectstorage.sa-saopaulo-1.oraclecloud.com',
    'objectstorage.us-chicago-1.oraclecloud.com',
    'objectstorage.us-sanjose-1.oraclecloud.com',
    'objectstorage.ap-hyderabad-1.oraclecloud.com',
    'objectstorage.ca-montreal-1.oraclecloud.com',
    'objectstorage.me-jeddah-1.oraclecloud.com',
    'objectstorage.eu-stockholm-1.oraclecloud.com',
    'objectstorage.eu-marseille-1.oraclecloud.com',
    'objectstorage.eu-milan-1.oraclecloud.com',
    'objectstorage.uk-london-1.oraclecloud.com',
    'objectstorage.eu-frankfurt-1.oraclecloud.com',
    'objectstorage.eu-madrid-3.oraclecloud.com',
    'objectstorage.ap-mumbai-1.oraclecloud.com',
    'objectstorage.il-jerusalem-1.oraclecloud.com',
    'objectstorage.me-riyadh-1.oraclecloud.com',
    'objectstorage.af-johannesburg-1.oraclecloud.com',
    'objectstorage.eu-amsterdam-1.oraclecloud.com',
    'objectstorage.me-dubai-1.oraclecloud.com',
    'objectstorage.uk-cardiff-1.oraclecloud.com',
    'objectstorage.eu-paris-1.oraclecloud.com',
    'objectstorage.us-ashburn-1.oraclecloud.com',
    'objectstorage.ap-sydney-1.oraclecloud.com',
    'objectstorage.us-phoenix-1.oraclecloud.com',
    'objectstorage.ap-singapore-1.oraclecloud.com',
    'objectstorage.ap-chuncheon-1.oraclecloud.com',
    'objectstorage.ap-batam-1.oraclecloud.com',
    'objectstorage.ap-melbourne-1.oraclecloud.com',
    'objectstorage.ap-tokyo-1.oraclecloud.com',
    'objectstorage.eu-zurich-1.oraclecloud.com',
    'objectstorage.sa-vinhedo-1.oraclecloud.com',
    'objectstorage.eu-dublin-3.oraclecloud.com',
    'objectstorage.us-dallas-1.oraclecloud.com',
    'objectstorage.mx-queretaro-1.oraclecloud.com',
    'objectstorage.ap-singapore-2.oraclecloud.com',
    'objectstorage.sa-valparaiso-1.oraclecloud.com',
    'objectstorage.us-sanantonio-1.oraclecloud.com',
    'objectstorage.sa-bogota-1.oraclecloud.com',
    'objectstorage.us-saltlake-2.oraclecloud.com',
    'objectstorage.us-lenexa-1.oraclecloud.com',
    'objectstorage.ap-delhi-1.oraclecloud.com',
    'objectstorage.us-desmoines-1.oraclecloud.com',
    'objectstorage.us-abilene-1.oraclecloud.com',
    'objectstorage.ap-kulai-1.oraclecloud.com',
    'objectstorage.us-shawnee-1.oraclecloud.com',
    'objectstorage.us-boardman-1.oraclecloud.com',
    'objectstorage.us-quincy-1.oraclecloud.com',
    'objectstorage.sa-riodejaneiro-2.oraclecloud.com',
    'ams-nl-ping.vultr.com',
    'ga-us-ping.vultr.com',
    'blr-in-ping.vultr.com',
    'bom-in-ping.vultr.com',
    'par-fr-ping.vultr.com',
    'del-in-ping.vultr.com',
    'tx-us-ping.vultr.com',
    'nj-us-ping.vultr.com',
    'fra-de-ping.vultr.com',
    'hon-hi-us-ping.vultr.com',
    'sel-kor-ping.vultr.com',
    'osk-jp-ping.vultr.com',
    'jnb-za-ping.vultr.com',
    'lax-ca-us-ping.vultr.com',
    'lon-gb-ping.vultr.com',
    'mad-es-ping.vultr.com',
    'man-uk-ping.vultr.com',
    'mel-au-ping.vultr.com',
    'mex-mx-ping.vultr.com',
    'fl-us-ping.vultr.com',
    'mxp-it-ping.vultr.com',
    'hnd-jp-ping.vultr.com',
    'il-us-ping.vultr.com',
    'sao-br-ping.vultr.com',
    'scl-cl-ping.vultr.com',
    'wa-us-ping.vultr.com',
    'sgp-ping.vultr.com',
    'sjo-ca-us-ping.vultr.com',
    'sto-se-ping.vultr.com',
    'syd-au-ping.vultr.com',
    'tlv-il-ping.vultr.com',
    'waw-pl-ping.vultr.com',
    'tor-ca-ping.vultr.com',
    'oss-cn-hangzhou.aliyuncs.com',
    'cn-hangzhou.oss.aliyuncs.com',
    'oss-cn-shanghai.aliyuncs.com',
    'cn-shanghai.oss.aliyuncs.com',
    'oss-cn-nanjing.aliyuncs.com',
    'oss-cn-fuzhou.aliyuncs.com',
    'oss-cn-wuhan-lr.aliyuncs.com',
    'oss-cn-qingdao.aliyuncs.com',
    'cn-qingdao.oss.aliyuncs.com',
    'oss-cn-beijing.aliyuncs.com',
    'cn-beijing.oss.aliyuncs.com',
    'oss-cn-zhangjiakou.aliyuncs.com',
    'cn-zhangjiakou.oss.aliyuncs.com',
    'oss-cn-huhehaote.aliyuncs.com',
    'cn-huhehaote.oss.aliyuncs.com',
    'oss-cn-wulanchabu.aliyuncs.com',
    'cn-wulanchabu.oss.aliyuncs.com',
    'oss-cn-shenzhen.aliyuncs.com',
    'cn-shenzhen.oss.aliyuncs.com',
    'oss-cn-heyuan.aliyuncs.com',
    'cn-heyuan.oss.aliyuncs.com',
    'oss-cn-guangzhou.aliyuncs.com',
    'cn-guangzhou.oss.aliyuncs.com',
    'oss-cn-chengdu.aliyuncs.com',
    'cn-chengdu.oss.aliyuncs.com',
    'oss-cn-hongkong.aliyuncs.com',
    'cn-hongkong.oss.aliyuncs.com',
    'oss-ap-northeast-1.aliyuncs.com',
    'oss-ap-northeast-2.aliyuncs.com',
    'oss-ap-southeast-1.aliyuncs.com',
    'ap-southeast-1.oss.aliyuncs.com',
    'oss-ap-southeast-3.aliyuncs.com',
    'oss-ap-southeast-5.aliyuncs.com',
    'oss-ap-southeast-6.aliyuncs.com',
    'oss-ap-southeast-7.aliyuncs.com',
    'oss-eu-central-1.aliyuncs.com',
    'eu-central-1.oss.aliyuncs.com',
    'oss-eu-west-1.aliyuncs.com',
    'oss-us-west-1.aliyuncs.com',
    'us-west-1.oss.aliyuncs.com',
    'oss-us-east-1.aliyuncs.com',
    'us-east-1.oss.aliyuncs.com',
    'oss-na-south-1.aliyuncs.com',
    'oss-me-east-1.aliyuncs.com',
    'oss-me-central-1.aliyuncs.com',
    'cos.ap-beijing.myqcloud.com',
    'cos.ap-nanjing.myqcloud.com',
    'cos.ap-shanghai.myqcloud.com',
    'cos.ap-guangzhou.myqcloud.com',
    'cos.ap-chengdu.myqcloud.com',
    'cos.ap-chongqing.myqcloud.com',
    'cos.ap-hongkong.myqcloud.com',
    'cos.ap-singapore.myqcloud.com',
    'cos.ap-jakarta.myqcloud.com',
    'cos.ap-seoul.myqcloud.com',
    'cos.ap-bangkok.myqcloud.com',
    'cos.ap-tokyo.myqcloud.com',
    'cos.na-siliconvalley.myqcloud.com',
    'cos.na-ashburn.myqcloud.com',
    'cos.sa-saopaulo.myqcloud.com',
    'cos.eu-frankfurt.myqcloud.com',
    'ecs.cn-north-1.myhuaweicloud.com',
    'ecs.cn-north-4.myhuaweicloud.com',
    'ecs.cn-north-9.myhuaweicloud.com',
    'ecs.cn-east-2.myhuaweicloud.com',
    'ecs.cn-east-3.myhuaweicloud.com',
    'ecs.cn-east-5.myhuaweicloud.com',
    'ecs.cn-south-1.myhuaweicloud.com',
    'ecs.cn-south-4.myhuaweicloud.com',
    'ecs.cn-southwest-2.myhuaweicloud.com',
    'ecs.ap-southeast-1.myhuaweicloud.com',
    'ecs.ap-southeast-2.myhuaweicloud.com',
    'ecs.ap-southeast-3.myhuaweicloud.com',
    'ecs.ap-southeast-4.myhuaweicloud.com',
    'ecs.ap-southeast-5.myhuaweicloud.com',
    'ecs.my-kualalumpur-1.myhuaweicloud.com',
    'ecs.af-south-1.myhuaweicloud.com',
    'ecs.af-north-1.myhuaweicloud.com',
    'ecs.la-north-2.myhuaweicloud.com',
    'ecs.na-mexico-1.myhuaweicloud.com',
    'ecs.la-south-2.myhuaweicloud.com',
    'ecs.sa-brazil-1.myhuaweicloud.com',
    'ecs.tr-west-1.myhuaweicloud.com',
    'ecs.me-east-1.myhuaweicloud.com',
    'eastus.api.cognitive.microsoft.com',
    'eastus2.api.cognitive.microsoft.com',
    'centralus.api.cognitive.microsoft.com',
    'northcentralus.api.cognitive.microsoft.com',
    'southcentralus.api.cognitive.microsoft.com',
    'westcentralus.api.cognitive.microsoft.com',
    'westus.api.cognitive.microsoft.com',
    'westus2.api.cognitive.microsoft.com',
    'westus3.api.cognitive.microsoft.com',
    'canadacentral.api.cognitive.microsoft.com',
    'canadaeast.api.cognitive.microsoft.com',
    'brazilsouth.api.cognitive.microsoft.com',
    'northeurope.api.cognitive.microsoft.com',
    'westeurope.api.cognitive.microsoft.com',
    'uksouth.api.cognitive.microsoft.com',
    'ukwest.api.cognitive.microsoft.com',
    'francecentral.api.cognitive.microsoft.com',
    'germanywestcentral.api.cognitive.microsoft.com',
    'switzerlandnorth.api.cognitive.microsoft.com',
    'switzerlandwest.api.cognitive.microsoft.com',
    'norwayeast.api.cognitive.microsoft.com',
    'swedencentral.api.cognitive.microsoft.com',
    'polandcentral.api.cognitive.microsoft.com',
    'italynorth.api.cognitive.microsoft.com',
    'spaincentral.api.cognitive.microsoft.com',
    'eastasia.api.cognitive.microsoft.com',
    'southeastasia.api.cognitive.microsoft.com',
    'japaneast.api.cognitive.microsoft.com',
    'japanwest.api.cognitive.microsoft.com',
    'koreacentral.api.cognitive.microsoft.com',
    'australiaeast.api.cognitive.microsoft.com',
    'newzealandnorth.api.cognitive.microsoft.com',
    'centralindia.api.cognitive.microsoft.com',
    'southindia.api.cognitive.microsoft.com',
    'jioindiawest.api.cognitive.microsoft.com',
    'jioindiacentral.api.cognitive.microsoft.com',
    'indonesiacentral.api.cognitive.microsoft.com',
    'malaysiawest.api.cognitive.microsoft.com',
    'uaenorth.api.cognitive.microsoft.com',
    'qatarcentral.api.cognitive.microsoft.com',
    'southafricanorth.api.cognitive.microsoft.com',
    'us-east-1.linodeobjects.com',
    'us-southeast-1.linodeobjects.com',
    'eu-central-1.linodeobjects.com',
    'ap-south-1.linodeobjects.com',
    'gb-lon-1.linodeobjects.com',
    'se-sto-1.linodeobjects.com',
    'es-mad-1.linodeobjects.com',
    'in-maa-1.linodeobjects.com',
    'jp-osa-1.linodeobjects.com',
    'it-mil-1.linodeobjects.com',
    'us-mia-1.linodeobjects.com',
    'id-cgk-1.linodeobjects.com',
    'us-lax-1.linodeobjects.com',
    'nl-ams-1.linodeobjects.com',
    'au-mel-1.linodeobjects.com',
    'in-bom-1.linodeobjects.com',
    'de-fra-1.linodeobjects.com',
    'sg-sin-1.linodeobjects.com',
    'jp-tyo-1.linodeobjects.com',
    'us-iad-2.linodeobjects.com',
    'br-gru-1.linodeobjects.com',
    'us-sea-1.linodeobjects.com',
    'fr-par-1.linodeobjects.com',
    'us-ord-1.linodeobjects.com',
    'us-iad-1.linodeobjects.com',
    'nyc3.digitaloceanspaces.com',
    'sfo2.digitaloceanspaces.com',
    'sfo3.digitaloceanspaces.com',
    'ams3.digitaloceanspaces.com',
    'sgp1.digitaloceanspaces.com',
    'lon1.digitaloceanspaces.com',
    'fra1.digitaloceanspaces.com',
    'tor1.digitaloceanspaces.com',
    'blr1.digitaloceanspaces.com',
    'syd1.digitaloceanspaces.com',
    'atl1.digitaloceanspaces.com',
    'ric1.digitaloceanspaces.com',
    'fsn1-speed.hetzner.com',
    'nbg1-speed.hetzner.com',
    'hel1-speed.hetzner.com',
    'ash-speed.hetzner.com',
    'hil-speed.hetzner.com',
    'sin-speed.hetzner.com',
    'proof.ovh.net',
    'lil1-rbx.speedtest.network.ovh.net',
    'sxb1-sbg.speedtest.network.ovh.net',
    'lon1-eri.speedtest.network.ovh.net',
    'ymq1-bhs.speedtest.network.ovh.net',
    'was1-vin.speedtest.network.ovh.net',
    'pdx1-hil.speedtest.network.ovh.net',
    'sin1-sgp.speedtest.network.ovh.net',
    'syd1-sy2.speedtest.network.ovh.net',
    'storage.us-central1.rep.googleapis.com',
    'storage.us-central2.rep.googleapis.com',
    'storage.us-east1.rep.googleapis.com',
    'storage.us-east4.rep.googleapis.com',
    'storage.us-east5.rep.googleapis.com',
    'storage.us-east7.rep.googleapis.com',
    'storage.us-south1.rep.googleapis.com',
    'storage.us-west1.rep.googleapis.com',
    'storage.us-west2.rep.googleapis.com',
    'storage.us-west3.rep.googleapis.com',
    'storage.us-west4.rep.googleapis.com',
    'storage.us-west8.rep.googleapis.com',
    'storage.northamerica-northeast1.rep.googleapis.com',
    'storage.northamerica-northeast2.rep.googleapis.com',
    'storage.northamerica-south1.rep.googleapis.com',
    'storage.southamerica-east1.rep.googleapis.com',
    'storage.southamerica-west1.rep.googleapis.com',
    'storage.europe-west1.rep.googleapis.com',
    'storage.europe-west2.rep.googleapis.com',
    'storage.europe-west3.rep.googleapis.com',
    'storage.europe-west4.rep.googleapis.com',
    'storage.europe-west6.rep.googleapis.com',
    'storage.europe-west8.rep.googleapis.com',
    'storage.europe-west9.rep.googleapis.com',
    'storage.europe-west10.rep.googleapis.com',
    'storage.europe-west12.rep.googleapis.com',
    'storage.europe-central2.rep.googleapis.com',
    'storage.europe-north1.rep.googleapis.com',
    'storage.europe-north2.rep.googleapis.com',
    'storage.europe-southwest1.rep.googleapis.com',
    'storage.me-central1.rep.googleapis.com',
    'storage.me-central2.rep.googleapis.com',
    'storage.me-west1.rep.googleapis.com',
    'storage.africa-south1.rep.googleapis.com',
    'storage.asia-east1.rep.googleapis.com',
    'storage.asia-east2.rep.googleapis.com',
    'storage.asia-northeast1.rep.googleapis.com',
    'storage.asia-northeast2.rep.googleapis.com',
    'storage.asia-northeast3.rep.googleapis.com',
    'storage.asia-south1.rep.googleapis.com',
    'storage.asia-south2.rep.googleapis.com',
    'storage.asia-southeast1.rep.googleapis.com',
    'storage.asia-southeast2.rep.googleapis.com',
    'storage.australia-southeast1.rep.googleapis.com',
    'storage.australia-southeast2.rep.googleapis.com',
    's3.us-south.cloud-object-storage.appdomain.cloud',
    's3.us-east.cloud-object-storage.appdomain.cloud',
    's3.ca-tor.cloud-object-storage.appdomain.cloud',
    's3.br-sao.cloud-object-storage.appdomain.cloud',
    's3.eu-gb.cloud-object-storage.appdomain.cloud',
    's3.eu-de.cloud-object-storage.appdomain.cloud',
    's3.eu-es.cloud-object-storage.appdomain.cloud',
    's3.jp-tok.cloud-object-storage.appdomain.cloud',
    's3.jp-osa.cloud-object-storage.appdomain.cloud',
    's3.au-syd.cloud-object-storage.appdomain.cloud',
    's3.fr-par.scw.cloud',
    's3.nl-ams.scw.cloud',
    's3.pl-waw.scw.cloud',
    's3.it-mil.scw.cloud',
    'tos-cn-beijing.volces.com',
    'tos-cn-shanghai.volces.com',
    'tos-cn-guangzhou.volces.com',
    'tos-cn-hongkong.volces.com',
    'tos-ap-southeast-1.volces.com',
    'tos-ap-southeast-3.volces.com',
    'bj.bcebos.com',
    'bd.bcebos.com',
    'su.bcebos.com',
    'gz.bcebos.com',
    'fwh.bcebos.com',
    'hkg.bcebos.com',
    'kr.object.ncloudstorage.com',
    'jp.object.ncloudstorage.com',
    'sg.object.ncloudstorage.com',
    'us.object.ncloudstorage.com',
    'de.object.ncloudstorage.com',
    'logging.de-fra.ionos.com',
    'logging.de-txl.ionos.com',
    'logging.es-vit.ionos.com',
    'logging.gb-lhr.ionos.com',
    'logging.gb-bhx.ionos.com',
    'logging.fr-par.ionos.com',
    'logging.us-mci.ionos.com',
    'logging.us-las.ionos.com',
    'logging.us-ewr.ionos.com',
    'r1-it.storage.cloud.it',
    'r3-it.storage.cloud.it',
    'r1-fr.storage.arubacloud.fr',
    'r1-cz.storage.forpsicloud.cz',
    'r1-de.storage.arubacloud.de',
    'r1-uk.storage.arubacloud.co.uk',
    'r1-pl.storage.arubacloud.pl',
    'nl.object-storage.io',
    'de.object-storage.io',
    'uk.object-storage.io',
    'us.object-storage.io',
    'ca.object-storage.io',
    'sg.object-storage.io',
    'luxembourg-2.storage.gcore.dev',
    'chicago-1.storage.gcore.dev',
    'almaty-1.storage.gcore.dev',
    'sines-2.storage.gcore.dev',
    'sines-3.storage.gcore.dev',
    'london-2.storage.gcore.dev',
    'singapore-1.storage.gcore.dev',
    'storage.yandexcloud.net',
    'storage.yandexcloud.kz',
    'www.cloudflare.com',
    'store.akamai.steamstatic.com',
    'a0.awsstatic.com',
    'www.gstatic.com',
    'github.githubassets.com',
    'assets.xboxservices.com',
    'speed.cloudflare.com',
    'stun.cloudflare.com',
    'ipv4-check-perf.radar.cloudflare.com',
    'ipv6-check-perf.radar.cloudflare.com',
    'api4.ipify.org',
    'api6.ipify.org',
    'v4.ident.me',
    'v6.ident.me'
  ],
  'default-nameserver': ['tls://223.5.5.5', 'tls://223.6.6.6'],
  nameserver: ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query']
};

const geoxURL = {
  geoip: `${GEOX_CDN}/gh/appshubcc/bett-rules@release/geoip.dat`,
  geosite: `${GEOX_CDN}/gh/appshubcc/bett-rules@release/geosite.dat`,
  mmdb: `${GEOX_CDN}/gh/appshubcc/bett-rules@release/country.mmdb`,
  asn: `${GEOX_CDN}/gh/appshubcc/bett-rules@release/GeoLite2-ASN.mmdb`
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
const AKCDN_PATTERN = '(?i)\\bAKCDN\\b|\\bIX\\b|163\\.223\\.125\\.8|43\\.136\\.98\\.179|162\\.14\\.111\\.30|39\\.108\\.228\\.6';
const TRANSIT_EXCLUDE_PATTERN = [ISP_EXCLUDE_PATTERN, AKCDN_PATTERN]
  .map((pattern) => pattern.replace(/^\\(\\?i\\)/, ''))
  .join('|');
const LOW_COST_PATTERN = '(?i)0\\.[0-5]|低倍率|省流|大流量|实验性';

const ISP_OR_LANDING_RE = makeRegex(ISP_EXCLUDE_PATTERN);
const AKCDN_RE = makeRegex(AKCDN_PATTERN);
const LOW_COST_RE = makeRegex(LOW_COST_PATTERN);
const COUNTRY_ENTRIES = compileCountryEntries(countryRegex);
const COUNTRY_REGEX_MAP = new Map(
  COUNTRY_ENTRIES.map(({ country, regex }) => [country, regex])
);

const SERVICE_GROUP_SPECS = Object.freeze([
  { name: '人工智能', icon: 'AI.png', source: 'default' },
  { name: '加密货币', icon: 'Cryptocurrency_1.png', source: 'default' },
  { name: 'PayPal', icon: 'PayPal.png', source: 'default' },
  { name: 'Telegram', icon: 'Telegram.png', source: 'default' },
  { name: 'Microsoft', icon: 'Microsoft.png', source: 'default' },
  { name: 'Apple', icon: 'Apple_1.png', source: 'default' },
  { name: 'Google', icon: 'Google_Search.png', source: 'default' },
  { name: 'YouTube', icon: 'YouTube.png', source: 'default' },
  { name: 'Disney', icon: 'Disney+.png', source: 'default' },
  { name: 'Netflix', icon: 'Netflix.png', source: 'default' },
  { name: 'Spotify', icon: 'Spotify.png', source: 'default' },
  { name: 'Twitter(X)', icon: 'X.png', source: 'default' },
  { name: '学术资源', icon: 'Scholar.png', source: 'direct' },
  { name: '开发者资源', icon: 'GitHub.png', source: 'default' },
  { name: '游戏下载', icon: 'Download.png', source: 'default' },
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

function parseBoolWithDefault(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return parseBool(value);
}

function cloneSnifferConfig(useAggressiveDefaults) {
  const config = {
    ...snifferConfigBase,
    sniff: {
      TLS: { ...snifferConfigBase.sniff.TLS },
      HTTP: { ...snifferConfigBase.sniff.HTTP },
      QUIC: { ...snifferConfigBase.sniff.QUIC }
    },
    'skip-domain': [...snifferConfigBase['skip-domain']]
  };

  if (!useAggressiveDefaults) {
    config.sniff.TLS['override-destination'] = false;
    config.sniff.QUIC['override-destination'] = false;
  }

  return config;
}

function cloneDnsConfig(useAggressiveDefaults) {
  return {
    ...dnsConfigBase,
    ipv6: options.ipv6Enabled,
    'prefer-h3': useAggressiveDefaults ? dnsConfigBase['prefer-h3'] : false,
    'fake-ip-filter': [...dnsConfigBase['fake-ip-filter']],
    'default-nameserver': [...dnsConfigBase['default-nameserver']],
    nameserver: [...dnsConfigBase.nameserver]
  };
}

function resolveTcpConcurrent(useAggressiveDefaults) {
  return parseBoolWithDefault(runtimeArgs.tcpconcurrent, useAggressiveDefaults);
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

function isAkcdnNode(proxy) {
  const server = proxy && proxy.server !== undefined ? String(proxy.server) : '';
  return AKCDN_RE.test(`${asString(proxy && proxy.name)} ${server}`);
}

function isDialerLandingNode(proxy) {
  return Boolean(proxy && proxy['dialer-proxy'] && isIspName(proxy.name));
}

function proxyServerKey(proxy) {
  return proxy && proxy.server !== undefined ? String(proxy.server).toLowerCase() : '';
}

function isTransitNode(proxy, landingServerKeys) {
  if (!proxy || !proxy.name) return false;
  if (proxy['dialer-proxy']) return false;
  if (proxy.type === 'direct') return false;
  if (isIspName(proxy.name) || isAkcdnNode(proxy)) return false;
  const serverKey = proxyServerKey(proxy);
  return !serverKey || !landingServerKeys.has(serverKey);
}

function parseTransitNodes(proxies) {
  const landingServerKeys = new Set(
    proxies.filter(isDialerLandingNode).map(proxyServerKey).filter(Boolean)
  );
  return proxies
    .filter((proxy) => isTransitNode(proxy, landingServerKeys))
    .map((proxy) => proxy.name)
    .filter(Boolean);
}

function parseAkcdnFallbackNodes(proxies) {
  return proxies
    .filter((proxy) =>
      isAkcdnNode(proxy) &&
      !proxy['dialer-proxy'] &&
      !isIspName(proxy.name) &&
      ['台湾', '新加坡'].some((country) => COUNTRY_REGEX_MAP.get(country).test(proxy.name))
    )
    .map((proxy) => proxy.name);
}

function parseLowCostNodes(proxies, excludeDialerProxyNodes) {
  return proxies
    .filter((proxy) => (!excludeDialerProxyNodes || !proxy['dialer-proxy']) && isLowCostName(proxy.name))
    .map((proxy) => proxy.name);
}

function parseLandingNodes(proxies) {
  return proxies
    .filter((proxy) => isIspName(proxy.name))
    .map((proxy) => proxy.name);
}

function parseLandingCountryGroups(landingNodes) {
  const groups = new Map();

  for (const name of landingNodes) {
    const match = COUNTRY_ENTRIES.find(({ regex }) => regex.test(name));
    if (!match) continue;

    if (!groups.has(match.country)) groups.set(match.country, []);
    groups.get(match.country).push(name);
  }

  return {
    groups: [...groups].map(([country, nodes]) => ({
      country,
      name: `${country}落地`,
      nodes
    })),
    defaultNodes: groups.get('台湾') || groups.values().next().value || []
  };
}

function parseCountryBuckets(proxies, countryList, excludeDialerProxyNodes) {
  const buckets = Object.fromEntries(countryList.map((country) => [country, []]));

  for (const proxy of proxies) {
    const name = asString(proxy.name);
    if (!name || (excludeDialerProxyNodes && proxy['dialer-proxy']) || isIspName(name)) continue;

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

function appendUnique(arr, values) {
  if (!Array.isArray(arr) || !Array.isArray(values)) return;
  for (const value of values) {
    if (!arr.includes(value)) {
      arr.push(value);
    }
  }
}

function uniqueStrings(values) {
  const result = [];
  for (const value of values) {
    if (typeof value === 'string' && value && !result.includes(value)) {
      result.push(value);
    }
  }
  return result;
}

function proxyNameExcludePattern(proxies) {
  const names = uniqueStrings(
    proxies.filter((proxy) => proxy['dialer-proxy']).map((proxy) => proxy.name)
  ).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return names.length ? `^(${names.join('|')})$` : '';
}

function addExcludePattern(pattern, additionalPattern) {
  if (!additionalPattern) return pattern;
  return `(?i)${[pattern, additionalPattern]
    .filter(Boolean)
    .map((value) => String(value).replace(/\(\?i\)/g, ''))
    .join('|')}`;
}

function timedAutoGroupFields(lazy = false) {
  return { url: 'https://cp.cloudflare.com/generate_204', interval: 300, tolerance: 20, lazy };
}

function buildServiceGroups(defaultProxies, directProxies) {
  return SERVICE_GROUP_SPECS.map(({ name, icon, source }) => ({
    name,
    icon: ICON(icon),
    type: 'select',
    proxies: source === 'direct' ? [...directProxies] : [...defaultProxies]
  }));
}

function buildTransitCountryProxyGroups(countryList, transitNodes) {
  const groups = [];
  const groupType = regionalAutoGroupType();

  for (const country of countryList) {
    const regex = COUNTRY_REGEX_MAP.get(country);
    if (!regex) continue;

    const nodes = uniqueStrings(transitNodes.filter((name) => regex.test(name)));
    if (!nodes.length) continue;

    const group = {
      name: `中转${country}节点`,
      icon: countryIconURLs[country],
      type: groupType,
      proxies: nodes
    };

    if (!options.loadBalance) {
      Object.assign(group, timedAutoGroupFields(true));
    }

    groups.push(group);
  }

  return groups;
}

function buildTransitProxyGroups(countryList, transitNodes) {
  const uniqueTransitNodes = uniqueStrings(transitNodes);
  const transitCountryGroups = buildTransitCountryProxyGroups(countryList, uniqueTransitNodes);
  const lowCostTransitNodes = uniqueStrings(uniqueTransitNodes.filter(isLowCostName));

  const groups = [
    {
      name: '中转自动选择',
      icon: ICON('Auto.png'),
      type: autoGroupType(),
      proxies: [...uniqueTransitNodes],
      ...timedAutoGroupFields()
    },
    ...transitCountryGroups
  ];

  if (lowCostTransitNodes.length) {
    const lowCostGroup = {
      name: '中转低倍率节点',
      icon: ICON('Pig.png'),
      type: regionalAutoGroupType(),
      proxies: lowCostTransitNodes
    };
    if (!options.loadBalance) {
      Object.assign(lowCostGroup, timedAutoGroupFields(true));
    }
    groups.push(lowCostGroup);
  }

  groups.push({
    name: '中转手动切换',
    icon: ICON('Static.png'),
    type: 'select',
    proxies: [...uniqueTransitNodes]
  });

  return groups;
}

// ======================== 国家解析 ========================
function parseCountries(proxies, excludeDialerProxyNodes) {
  const matched = new Set();

  for (const proxy of proxies) {
    if ((excludeDialerProxyNodes && proxy['dialer-proxy']) || isIspName(proxy.name)) continue;

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
function buildCountryProxyGroups(countryList, countryBuckets, dialerProxyExcludePattern) {
  const groups = [];
  const groupType = regionalAutoGroupType();

  for (const country of countryList) {
    if (!countryRegex[country]) continue;

    const group = {
      name: `${country}节点`,
      icon: countryIconURLs[country],
      type: groupType
    };

    if (options.regexFilter) {
      Object.assign(group, {
        'include-all': true,
        filter: countryRegex[country],
        'exclude-filter': addExcludePattern(ISP_EXCLUDE_PATTERN, dialerProxyExcludePattern)
      });
    } else {
      const nodes = countryBuckets[country] || [];
      if (!nodes.length) continue;
      group.proxies = nodes;
    }

    if (!options.loadBalance) {
      Object.assign(group, timedAutoGroupFields(true));
    }

    groups.push(group);
  }

  return groups;
}

function autoGroupType() {
  return options.smartStrategy ? 'smart' : 'url-test';
}

function regionalAutoGroupType() {
  return options.loadBalance ? 'load-balance' : autoGroupType();
}

// ========================= 代理组 =========================
function buildProxyGroups(
  countryList,
  countryProxyGroups,
  lowCostNodes,
  landingNodes,
  landingCountryData,
  akcdnFallbackNodes,
  transitNodes,
  defaults,
  proxies,
  dialerProxyExcludePattern
) {
  const {
    defaultProxies,
    defaultSelector,
    defaultProxiesDirect,
    globalProxies
  } = defaults;

  const hasLowCostGroup = options.regexFilter || lowCostNodes.length > 0;
  const hasAkcdnFallbackGroup = options.akcdnFallback && akcdnFallbackNodes.length > 0;
  const hasLandingGroup =
    (options.landing || hasAkcdnFallbackGroup) &&
    (options.regexFilter || landingNodes.length > 0);
  const landingCountryProxyGroups = hasLandingGroup
    ? landingCountryData.groups.map(({ country, name, nodes }) => ({
        name,
        icon: countryIconURLs[country],
        type: 'fallback',
        url: 'http://cp.cloudflare.com/generate_204',
        interval: 60,
        timeout: 3000,
        'max-failed-times': 2,
        lazy: false,
        proxies: [...nodes]
      }))
    : [];
  const landingCountryGroupNames = landingCountryProxyGroups.map((group) => group.name);
  const proxyNames = new Set(proxies.map((proxy) => proxy.name));
  for (const name of landingCountryGroupNames) {
    if (proxyNames.has(name)) {
      throw new Error(`Proxy name conflicts with generated group: ${name}`);
    }
  }
  const countryProxies = [];

  for (const country of countryList) {
    const groupName = `${country}节点`;
    countryProxies.push(groupName);
  }
  appendUnique(countryProxies, landingCountryGroupNames);

  if (hasLowCostGroup) {
    insertAfter(globalProxies, '自动选择', '低倍率节点');
    countryProxies.push('低倍率节点');
  }

  insertUniqueAt(defaultProxies, 1, countryProxies);
  insertUniqueAt(defaultSelector, 1, countryProxies);
  insertUniqueAt(defaultProxiesDirect, 2, countryProxies);

  if (hasAkcdnFallbackGroup) {
    insertAfter(defaultProxies, '自动选择', 'IX节点');
    if (!defaultSelector.includes('IX节点')) {
      defaultSelector.unshift('IX节点');
    }
    insertAfter(globalProxies, '自动选择', 'IX节点');
  }

  if (hasLandingGroup) {
    if (!hasAkcdnFallbackGroup && landingCountryGroupNames.length) {
      const defaultLanding = landingCountryGroupNames.includes('台湾落地')
        ? '台湾落地'
        : landingCountryGroupNames[0];
      defaultSelector.splice(defaultSelector.indexOf(defaultLanding), 1);
      defaultSelector.unshift(defaultLanding);
    }
    insertAfter(globalProxies, '自动选择', '前置代理');
  }
  appendUnique(globalProxies, countryProxies);

  const transitProxyGroups = hasAkcdnFallbackGroup && transitNodes.length
    ? buildTransitProxyGroups(countryList, transitNodes)
    : [];
  const basicPreProxyManualGroup =
    hasLandingGroup && !hasAkcdnFallbackGroup && transitNodes.length
      ? {
          name: '中转手动切换',
          icon: ICON('Static.png'),
          type: 'select',
          proxies: uniqueStrings(transitNodes)
        }
      : null;
  const preProxySelector = transitProxyGroups.length
    ? transitProxyGroups.map((group) => group.name)
    : defaultSelector
        .filter(
          (name) =>
            name !== 'IX节点' &&
            !landingCountryGroupNames.includes(name)
        )
        .flatMap((name) => {
          if (name !== '手动切换') return [name];
          return basicPreProxyManualGroup ? [basicPreProxyManualGroup.name] : [];
        });
  const directFallbackProxies = ['节点选择', '手动切换', '全球直连'];
  const serviceGroups = buildServiceGroups(defaultProxies, directFallbackProxies);

  return [
    {
      name: '节点选择',
      icon: ICON('Proxy.png'),
      type: 'select',
      proxies: [...defaultSelector]
    },

    hasAkcdnFallbackGroup
      ? {
          name: 'IX节点',
          icon: ICON('Available.png'),
          type: 'select',
          proxies: [...akcdnFallbackNodes]
        }
      : null,

    ...landingCountryProxyGroups,

    hasLandingGroup
      ? {
          name: '前置代理',
          icon: ICON('LinkCube.png'),
          type: 'select',
          ...(hasAkcdnFallbackGroup
            ? { proxies: [...preProxySelector] }
            : options.regexFilter
            ? {
                'include-all': true,
                'exclude-filter': addExcludePattern(TRANSIT_EXCLUDE_PATTERN, dialerProxyExcludePattern),
                proxies: [...preProxySelector]
              }
            : { proxies: [...preProxySelector] })
        }
      : null,

    ...transitProxyGroups,
    basicPreProxyManualGroup,

    hasLowCostGroup
      ? {
          name: '低倍率节点',
          icon: ICON('Pig.png'),
          type: regionalAutoGroupType(),
          ...(!options.loadBalance ? timedAutoGroupFields(true) : {}),
          ...(options.regexFilter
            ? {
                'include-all': true,
                filter: LOW_COST_PATTERN,
                ...(dialerProxyExcludePattern
                  ? { 'exclude-filter': dialerProxyExcludePattern }
                  : {})
              }
            : { proxies: [...lowCostNodes] })
        }
      : null,

    {
      name: '手动切换',
      icon: ICON('Static.png'),
      type: 'select',
      'include-all': true
    },

    {
      name: '自动选择',
      icon: ICON('Auto.png'),
      type: autoGroupType(),
      'include-all': true,
      'exclude-filter': addExcludePattern(ISP_EXCLUDE_PATTERN, dialerProxyExcludePattern),
      ...timedAutoGroupFields()
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
      proxies: [...globalProxies]
    }
  ].filter(Boolean);
}

// ========================= 主入口 =========================
function main(config) {
  const safeConfig = asPlainObject(config);

  const proxies = normalizeProxyList(safeConfig);
  const defaultProxies = [...defaultProxiesBase];
  const defaultSelector = [...defaultSelectorBase];
  const defaultProxiesDirect = [...defaultProxiesDirectBase];
  const globalProxies = [...globalProxiesBase];
  const dnsConfig = cloneDnsConfig(options.useAggressiveDefaults);
  const snifferConfig = cloneSnifferConfig(options.useAggressiveDefaults);

  const landingEnabled = options.landing || options.akcdnFallback;
  const dialerProxyExcludePattern = landingEnabled ? proxyNameExcludePattern(proxies) : '';
  const countryList = parseCountries(proxies, landingEnabled);
  const lowCostNodes = parseLowCostNodes(proxies, landingEnabled);
  const landingNodes =
    landingEnabled ? parseLandingNodes(proxies) : [];
  const landingCountryData = parseLandingCountryGroups(landingNodes);
  const transitNodes = landingEnabled ? parseTransitNodes(proxies) : [];
  const akcdnFallbackNodes = options.akcdnFallback
    ? parseAkcdnFallbackNodes(proxies)
    : [];
  const countryBuckets = options.regexFilter
    ? {}
    : parseCountryBuckets(proxies, countryList, landingEnabled);
  const countryProxyGroups = buildCountryProxyGroups(
    countryList,
    countryBuckets,
    dialerProxyExcludePattern
  );

  const proxyGroups = buildProxyGroups(
    countryList,
    countryProxyGroups,
    lowCostNodes,
    landingNodes,
    landingCountryData,
    akcdnFallbackNodes,
    transitNodes,
    { defaultProxies, defaultSelector, defaultProxiesDirect, globalProxies },
    proxies,
    dialerProxyExcludePattern
  );
  const finalRules = buildRules(options.quicEnabled);

  if (options.fullConfig) {
    if (options.android) delete safeConfig['routing-mark'];

    Object.assign(safeConfig, {
      'mixed-port': 7890,
      'redir-port': 7892,
      'tproxy-port': 7893,
      ...(options.android ? {} : { 'routing-mark': 7894 }),
      'allow-lan': true,
      ipv6: options.ipv6Enabled,
      mode: 'rule',
      'unified-delay': true,
      'tcp-concurrent': resolveTcpConcurrent(options.useAggressiveDefaults),
      'log-level': 'info',
      'geodata-loader': 'standard',
      'external-controller': options.android ? '127.0.0.1:9999' : ':9999',
      'disable-keep-alive': false,
      profile: { 'store-selected': true }
    });
  }

  Object.assign(safeConfig, {
    'geo-auto-update': parseBoolWithDefault(runtimeArgs.geoupdate, safeConfig['geo-auto-update'] ?? true),
    'geo-update-interval': safeConfig['geo-update-interval'] ?? 24,
    'proxy-groups': proxyGroups,
    'rule-providers': ruleProviders,
    rules: finalRules,
    sniffer: snifferConfig,
    dns: dnsConfig,
    'geodata-mode': true,
    'geox-url': geoxURL
  });

  return safeConfig;
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
