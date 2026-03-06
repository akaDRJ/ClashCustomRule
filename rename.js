/**
 * rename.js - Sub-Store 节点重命名与过滤脚本
 * 更新日期：2026-03-06
 *
 * 功能概述：
 * - 自动识别节点所属国家/地区（支持国旗、中文、英文简写/全称）
 * - 统一节点命名格式（国旗 + 地区名 + 序号）
 * - 按关键词过滤/保留节点
 * - 添加机场前缀、保留倍率标识、ISP标签等
 *
 * 使用方式：
 * 在 Sub-Store 脚本操作中添加，URL 后接 # 参数，多个参数用 & 连接
 * 示例：https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/rename.js#flag=true&name=NX&rmkey=Premium
 * 禁用缓存：在 URL 末尾添加 #noCache
 *
 * ==================== 核心参数 ====================
 *
 * 【输入识别】
 * [in=]      强制指定输入识别类型（默认自动判断）
 *            可选：zh/cn(中文), en/us(英文简写), flag/gq(国旗), quan(英文全称)
 *            优先级（自动时）：zh > flag > quan > en
 *
 * [out=]     指定输出名称类型（默认中文）
 *            可选：cn/zh(中文), us/en(英文简写), gq/flag(国旗), quan(英文全称)
 *
 * 【命名格式】
 * [flag]     在节点名前添加国旗（如 🇭🇰 香港 01）
 * [name=]    添加机场名称前缀（如 NX）
 * [nf]       将 name 前缀放在最前面（默认在国旗后）
 *            效果：NX 🇭🇰 香港 01（nf=true）vs 🇭🇰 NX 香港 01（nf=false）
 *
 * [fgf=]     设置分隔符（默认空格）
 * [sn=]      设置国家与序号之间的分隔符（默认空格）
 * [one]      清理只有一个节点的地区的序号 01
 *
 * 【过滤参数 - 删除节点】
 * [rmkey=]   按关键词删除节点（+ 分隔，不区分大小写）
 *            示例：rmkey=Premium+Test 删除含 Premium 或 Test 的节点
 *
 * [clear]    清理含营销/广告关键词的节点名（套餐/到期/流量/机场等）
 * [nx]       只保留 1 倍率或不显示倍率的节点
 * [blnx]     只保留高倍率节点（排除 1 倍率）
 * [key]      只保留指定国家/地区的节点（HK/SG/JP/US/KR等 + 序号）
 *
 * 【保留参数 - 节点名中保留原字段】
 * [blkey=]   保留指定关键词在原节点名中（+ 分隔，区分大小写）
 *            支持替换：GPT>新名字 表示将 GPT 替换为新名字
 *            示例：blkey=IPLC+GPT>AI+NF
 *
 * [blgd]     保留 ISP/线路标签（家宽/商宽/IPLC/IEPL/ˣ²等）
 * [bl]       保留倍率标识（2x/3倍/0.5x等）并添加到节点名
 *
 * 【排序与分组】
 * [blpx]     按保留的特殊标识排序（需配合 bl 使用，无 bl 时不生效）
 *            顺序：IPLC/IEPL > Kern/Edge > Pro/Std > 其他
 *
 * [nm]       保留未匹配到国家/地区的节点（默认删除）
 *
 * 【其他】
 * [blockquic=on/off]  设置 block-quic 属性
 * [dictcheck]         启用字典回归测试（调试模式）
 */

// const inArg = {'blkey':'iplc+GPT>GPTnewName+IPLC', 'flag':true };
const inArgRaw = typeof $arguments === "object" && $arguments !== null ? $arguments : {};

function parseBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "on";
  }
  return false;
}

function decodeArg(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  try {
    return decodeURI(String(value));
  } catch (_error) {
    return String(value);
  }
}

const inArg = {};
for (const [k, v] of Object.entries(inArgRaw || {})) {
  inArg[String(k).toLowerCase()] = v;
}

const nx = parseBool(inArg.nx),
  bl = parseBool(inArg.bl),
  nf = parseBool(inArg.nf),
  key = parseBool(inArg.key),
  blgd = parseBool(inArg.blgd),
  blpx = parseBool(inArg.blpx),
  blnx = parseBool(inArg.blnx),
  numone = parseBool(inArg.one),
  clear = parseBool(inArg.clear),
  addflag = parseBool(inArg.flag),
  nm = parseBool(inArg.nm),
  dictcheck = parseBool(inArg.dictcheck);

const FGF = decodeArg(inArg.fgf, " "),
  XHFGF = decodeArg(inArg.sn, " "),
  FNAME = decodeArg(inArg.name, ""),
  BLKEY = decodeArg(inArg.blkey, ""),
  RMKEY = decodeArg(inArg.rmkey, ""),
  blockquic = decodeArg(inArg.blockquic, "").toLowerCase(),
  nameMap = {
    cn: "cn",
    zh: "cn",
    us: "us",
    en: "us",
    quan: "quan",
    gq: "gq",
    flag: "gq",
  },
  inname = nameMap[String(inArg.in || "").toLowerCase()] || "",
  outputName = nameMap[String(inArg.out || "").toLowerCase()] || "";
// prettier-ignore
const FG = ['🇭🇰','🇲🇴','🇹🇼','🇯🇵','🇰🇷','🇸🇬','🇺🇸','🇬🇧','🇫🇷','🇩🇪','🇦🇺','🇦🇪','🇦🇫','🇦🇱','🇩🇿','🇦🇴','🇦🇷','🇦🇲','🇦🇹','🇦🇿','🇧🇭','🇧🇩','🇧🇾','🇧🇪','🇧🇿','🇧🇯','🇧🇹','🇧🇴','🇧🇦','🇧🇼','🇧🇷','🇻🇬','🇧🇳','🇧🇬','🇧🇫','🇧🇮','🇰🇭','🇨🇲','🇨🇦','🇨🇻','🇰🇾','🇨🇫','🇹🇩','🇨🇱','🇨🇴','🇰🇲','🇨🇬','🇨🇩','🇨🇷','🇭🇷','🇨🇾','🇨🇿','🇩🇰','🇩🇯','🇩🇴','🇪🇨','🇪🇬','🇸🇻','🇬🇶','🇪🇷','🇪🇪','🇪🇹','🇫🇯','🇫🇮','🇬🇦','🇬🇲','🇬🇪','🇬🇭','🇬🇷','🇬🇱','🇬🇹','🇬🇳','🇬🇾','🇭🇹','🇭🇳','🇭🇺','🇮🇸','🇮🇳','🇮🇩','🇮🇷','🇮🇶','🇮🇪','🇮🇲','🇮🇱','🇮🇹','🇨🇮','🇯🇲','🇯🇴','🇰🇿','🇰🇪','🇰🇼','🇰🇬','🇱🇦','🇱🇻','🇱🇧','🇱🇸','🇱🇷','🇱🇾','🇱🇹','🇱🇺','🇲🇰','🇲🇬','🇲🇼','🇲🇾','🇲🇻','🇲🇱','🇲🇹','🇲🇷','🇲🇺','🇲🇽','🇲🇩','🇲🇨','🇲🇳','🇲🇪','🇲🇦','🇲🇿','🇲🇲','🇳🇦','🇳🇵','🇳🇱','🇳🇿','🇳🇮','🇳🇪','🇳🇬','🇰🇵','🇳🇴','🇴🇲','🇵🇰','🇵🇦','🇵🇾','🇵🇪','🇵🇭','🇵🇹','🇵🇷','🇶🇦','🇷🇴','🇷🇺','🇷🇼','🇸🇲','🇸🇦','🇸🇳','🇷🇸','🇸🇱','🇸🇰','🇸🇮','🇸🇴','🇿🇦','🇪🇸','🇱🇰','🇸🇩','🇸🇷','🇸🇿','🇸🇪','🇨🇭','🇸🇾','🇹🇯','🇹🇿','🇹🇭','🇹🇬','🇹🇴','🇹🇹','🇹🇳','🇹🇷','🇹🇲','🇻🇮','🇺🇬','🇺🇦','🇺🇾','🇺🇿','🇻🇪','🇻🇳','🇾🇪','🇿🇲','🇿🇼','🇦🇩','🇷🇪','🇵🇱','🇬🇺','🇻🇦','🇱🇮','🇨🇼','🇸🇨','🇦🇶','🇬🇮','🇨🇺','🇫🇴','🇦🇽','🇧🇲','🇹🇱']
// prettier-ignore
const EN = ['HK','MO','TW','JP','KR','SG','US','GB','FR','DE','AU','AE','AF','AL','DZ','AO','AR','AM','AT','AZ','BH','BD','BY','BE','BZ','BJ','BT','BO','BA','BW','BR','VG','BN','BG','BF','BI','KH','CM','CA','CV','KY','CF','TD','CL','CO','KM','CG','CD','CR','HR','CY','CZ','DK','DJ','DO','EC','EG','SV','GQ','ER','EE','ET','FJ','FI','GA','GM','GE','GH','GR','GL','GT','GN','GY','HT','HN','HU','IS','IN','ID','IR','IQ','IE','IM','IL','IT','CI','JM','JO','KZ','KE','KW','KG','LA','LV','LB','LS','LR','LY','LT','LU','MK','MG','MW','MY','MV','ML','MT','MR','MU','MX','MD','MC','MN','ME','MA','MZ','MM','NA','NP','NL','NZ','NI','NE','NG','KP','NO','OM','PK','PA','PY','PE','PH','PT','PR','QA','RO','RU','RW','SM','SA','SN','RS','SL','SK','SI','SO','ZA','ES','LK','SD','SR','SZ','SE','CH','SY','TJ','TZ','TH','TG','TO','TT','TN','TR','TM','VI','UG','UA','UY','UZ','VE','VN','YE','ZM','ZW','AD','RE','PL','GU','VA','LI','CW','SC','AQ','GI','CU','FO','AX','BM','TL'];
// prettier-ignore
const ZH = ['香港','澳门','台湾','日本','韩国','新加坡','美国','英国','法国','德国','澳大利亚','阿联酋','阿富汗','阿尔巴尼亚','阿尔及利亚','安哥拉','阿根廷','亚美尼亚','奥地利','阿塞拜疆','巴林','孟加拉国','白俄罗斯','比利时','伯利兹','贝宁','不丹','玻利维亚','波斯尼亚和黑塞哥维那','博茨瓦纳','巴西','英属维京群岛','文莱','保加利亚','布基纳法索','布隆迪','柬埔寨','喀麦隆','加拿大','佛得角','开曼群岛','中非共和国','乍得','智利','哥伦比亚','科摩罗','刚果(布)','刚果(金)','哥斯达黎加','克罗地亚','塞浦路斯','捷克','丹麦','吉布提','多米尼加共和国','厄瓜多尔','埃及','萨尔瓦多','赤道几内亚','厄立特里亚','爱沙尼亚','埃塞俄比亚','斐济','芬兰','加蓬','冈比亚','格鲁吉亚','加纳','希腊','格陵兰','危地马拉','几内亚','圭亚那','海地','洪都拉斯','匈牙利','冰岛','印度','印尼','伊朗','伊拉克','爱尔兰','马恩岛','以色列','意大利','科特迪瓦','牙买加','约旦','哈萨克斯坦','肯尼亚','科威特','吉尔吉斯斯坦','老挝','拉脱维亚','黎巴嫩','莱索托','利比里亚','利比亚','立陶宛','卢森堡','马其顿','马达加斯加','马拉维','马来','马尔代夫','马里','马耳他','毛利塔尼亚','毛里求斯','墨西哥','摩尔多瓦','摩纳哥','蒙古','黑山共和国','摩洛哥','莫桑比克','缅甸','纳米比亚','尼泊尔','荷兰','新西兰','尼加拉瓜','尼日尔','尼日利亚','朝鲜','挪威','阿曼','巴基斯坦','巴拿马','巴拉圭','秘鲁','菲律宾','葡萄牙','波多黎各','卡塔尔','罗马尼亚','俄罗斯','卢旺达','圣马力诺','沙特阿拉伯','塞内加尔','塞尔维亚','塞拉利昂','斯洛伐克','斯洛文尼亚','索马里','南非','西班牙','斯里兰卡','苏丹','苏里南','斯威士兰','瑞典','瑞士','叙利亚','塔吉克斯坦','坦桑尼亚','泰国','多哥','汤加','特立尼达和多巴哥','突尼斯','土耳其','土库曼斯坦','美属维尔京群岛','乌干达','乌克兰','乌拉圭','乌兹别克斯坦','委内瑞拉','越南','也门','赞比亚','津巴布韦','安道尔','留尼汪','波兰','关岛','梵蒂冈','列支敦士登','库拉索','塞舌尔','南极','直布罗陀','古巴','法罗群岛','奥兰群岛','百慕达','东帝汶'];
// prettier-ignore
const QC = ['Hong Kong','Macao','Taiwan','Japan','Korea','Singapore','United States','United Kingdom','France','Germany','Australia','Dubai','Afghanistan','Albania','Algeria','Angola','Argentina','Armenia','Austria','Azerbaijan','Bahrain','Bangladesh','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','British Virgin Islands','Brunei','Bulgaria','Burkina-faso','Burundi','Cambodia','Cameroon','Canada','CapeVerde','CaymanIslands','Central African Republic','Chad','Chile','Colombia','Comoros','Congo-Brazzaville','Congo-Kinshasa','CostaRica','Croatia','Cyprus','Czech Republic','Denmark','Djibouti','Dominican Republic','Ecuador','Egypt','EISalvador','Equatorial Guinea','Eritrea','Estonia','Ethiopia','Fiji','Finland','Gabon','Gambia','Georgia','Ghana','Greece','Greenland','Guatemala','Guinea','Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Isle of Man','Israel','Italy','Ivory Coast','Jamaica','Jordan','Kazakstan','Kenya','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Lithuania','Luxembourg','Macedonia','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Mauritania','Mauritius','Mexico','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar(Burma)','Namibia','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','NorthKorea','Norway','Oman','Pakistan','Panama','Paraguay','Peru','Philippines','Portugal','PuertoRico','Qatar','Romania','Russia','Rwanda','SanMarino','SaudiArabia','Senegal','Serbia','SierraLeone','Slovakia','Slovenia','Somalia','SouthAfrica','Spain','SriLanka','Sudan','Suriname','Swaziland','Sweden','Switzerland','Syria','Tajikstan','Tanzania','Thailand','Togo','Tonga','TrinidadandTobago','Tunisia','Turkey','Turkmenistan','U.S.Virgin Islands','Uganda','Ukraine','Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe','Andorra','Reunion','Poland','Guam','Vatican','Liechtensteins','Curacao','Seychelles','Antarctica','Gibraltar','Cuba','Faroe Islands','Ahvenanmaa','Bermuda','Timor-Leste'];

const COUNTRY_ROWS = EN.map((code, index) => ({
  code,
  zh: ZH[index] || "",
  flag: FG[index] || "",
  quan: QC[index] || "",
}));

const COUNTRY_FIELD_BY_FORMAT = {
  cn: "zh",
  us: "code",
  gq: "flag",
  quan: "quan",
};

const COUNTRY_BY_CODE = new Map(COUNTRY_ROWS.map((row) => [row.code, row]));
const AMBIGUOUS_SHORT_CODES = new Set(["IN", "NO", "TO", "DO", "LA", "AM", "AS", "IS"]);
const AMBIGUOUS_CODE_GUARDS = {
  IN: /印度|India|🇮🇳/i,
  NO: /挪威|Norway|🇳🇴/i,
  TO: /汤加|Tonga|🇹🇴/i,
  DO: /多米尼加|Dominican|🇩🇴/i,
  LA: /老挝|Laos|🇱🇦/i,
  AM: /亚美尼亚|Armenia|🇦🇲/i,
  AS: /美属萨摩亚|Samoa|🇦🇸/i,
  IS: /冰岛|Iceland|🇮🇸/i,
};

const DICTIONARY_REGRESSION_SAMPLES = Object.freeze([
  { input: "HK BGP IPLC", expect: "HK" },
  { input: "香港 家宽 IEPL", expect: "HK" },
  { input: "Tokyo JP 01", expect: "JP" },
  { input: "Los Angeles USA 02", expect: "US" },
  { input: "India Mumbai 01", expect: "IN" },
  { input: "normal node without region", expect: "" },
]);

const specialRegex = [
  /(\d\.)?\d+×/,
  /IPLC|IEPL|Kern|Edge|Pro|Std|Exp|Biz|Fam|Game|Buy|Zx|LB|Game/,
];
const nameclear =
  /(套餐|到期|有效|剩余|版本|已用|过期|失联|测试|官方|网址|备用|群|TEST|客服|网站|获取|订阅|流量|机场|下次|官址|联系|邮箱|工单|学术|USE|USED|TOTAL|EXPIRE|EMAIL)/i;
// prettier-ignore
const regexArray=[/ˣ²/, /ˣ³/, /ˣ⁴/, /ˣ⁵/, /ˣ⁶/, /ˣ⁷/, /ˣ⁸/, /ˣ⁹/, /ˣ¹⁰/, /ˣ²⁰/, /ˣ³⁰/, /ˣ⁴⁰/, /ˣ⁵⁰/, /IPLC/i, /IEPL/i, /核心/, /边缘/, /高级/, /标准/, /实验/, /商宽/, /家宽/, /游戏|game/i, /购物/, /专线/, /LB/, /cloudflare/i, /\budp\b/i, /\bgpt\b/i,/udpn\b/];
// prettier-ignore
const valueArray= [ "2×","3×","4×","5×","6×","7×","8×","9×","10×","20×","30×","40×","50×","IPLC","IEPL","Kern","Edge","Pro","Std","Exp","Biz","Fam","Game","Buy","Zx","LB","CF","UDP","GPT","UDPN"];
const nameblnx = /(高倍|(?!1)2+(x|倍)|ˣ²|ˣ³|ˣ⁴|ˣ⁵|ˣ¹⁰)/i;
const namenx = /(高倍|(?!1)(0\.|\d)+(x|倍)|ˣ²|ˣ³|ˣ⁴|ˣ⁵|ˣ¹⁰)/i;
const keya =
  /港|Hong|HK|新加坡|SG|Singapore|日本|Japan|JP|美国|United States|US|韩|土耳其|TR|Turkey|Korea|KR|🇸🇬|🇭🇰|🇯🇵|🇺🇸|🇰🇷|🇹🇷/i;
const keyb =
  /(((1|2|3|4)\d)|(香港|Hong|HK) 0[5-9]|((新加坡|SG|Singapore|日本|Japan|JP|美国|United States|US|韩|土耳其|TR|Turkey|Korea|KR) 0[3-9]))/i;
const rurekey = {
  GB: /UK/g,
  "B-G-P": /BGP/g,
  "Russia Moscow": /Moscow/g,
  "Korea Chuncheon": /Chuncheon|Seoul/g,
  "Hong Kong": /Hongkong|HONG KONG/gi,
  "United Kingdom London": /London|Great Britain/g,
  "Dubai United Arab Emirates": /United Arab Emirates/g,
  "Taiwan TW 台湾 🇹🇼": /(台|Tai\s?wan|TW).*?🇨🇳|🇨🇳.*?(台|Tai\s?wan|TW)/g,
  "United States": /USA|Los Angeles|San Jose|Silicon Valley|Michigan/g,
  澳大利亚: /澳洲|墨尔本|悉尼|土澳|(深|沪|呼|京|广|杭)澳/g,
  德国: /(深|沪|呼|京|广|杭)德(?!.*(I|线))|法兰克福|滬德/g,
  香港: /(深|沪|呼|京|广|杭)港(?!.*(I|线))/g,
  日本: /(深|沪|呼|京|广|杭|中|辽)日(?!.*(I|线))|东京|大坂/g,
  新加坡: /狮城|(深|沪|呼|京|广|杭)新/g,
  美国: /(深|沪|呼|京|广|杭)美|波特兰|芝加哥|哥伦布|纽约|硅谷|俄勒冈|西雅图|芝加哥/g,
  波斯尼亚和黑塞哥维那: /波黑共和国/g,
  印尼: /印度尼西亚|雅加达/g,
  印度: /孟买/g,
  阿联酋: /迪拜|阿拉伯联合酋长国/g,
  孟加拉国: /孟加拉/g,
  捷克: /捷克共和国/g,
  台湾: /新台|新北|台(?!.*线)/g,
  Taiwan: /Taipei/g,
  韩国: /春川|韩|首尔/g,
  Japan: /Tokyo|Osaka/g,
  英国: /伦敦/g,
  India: /Mumbai/g,
  Germany: /Frankfurt/g,
  Switzerland: /Zurich/g,
  俄罗斯: /莫斯科/g,
  土耳其: /伊斯坦布尔/g,
  泰国: /泰國|曼谷/g,
  法国: /巴黎/g,
  G: /\d\s?GB/gi,
  Esnc: /esnc/gi,
};

const MULTIPLIER_CAPTURE_RE =
  /(?:倍率\s*[:：]?\s*)?(?:[Xx×]\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:倍|[Xx×])|[\[\(]\s*(\d+(?:\.\d+)?)\s*[\]\)])/;
const KEY_DIGIT_FILTER_RE = /2|4|6|7/i;
const BLKEY_RULES = BLKEY
  ? BLKEY.split("+")
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((raw) => {
        const pivot = raw.indexOf(">");
        if (pivot === -1) {
          return { raw, source: raw, replacement: "" };
        }
        return {
          raw,
          source: raw.slice(0, pivot),
          replacement: raw.slice(pivot + 1),
        };
      })
  : [];

const RMKEY_RULES = RMKEY
  ? RMKEY.split("+")
      .map((raw) => normalizeProxyName(raw))
      .filter(Boolean)
      .map((item) => item.toUpperCase())
  : [];

function resolveMatchPriority(key) {
  if (/^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(key)) return 140;
  if (/[\u4e00-\u9fff]/u.test(key)) return 130;
  if (/^[A-Z]{2,3}$/.test(key)) return 70;
  if (key.length >= 12) return 115;
  return 100;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeProxyName(name) {
  return String(name || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[|｜_/，、]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTokenRegex(token) {
  return new RegExp(`(^|[^A-Z0-9])${escapeRegex(token)}([^A-Z0-9]|$)`);
}

function isAmbiguousShortCodeMatch(code, normalizedName) {
  if (!AMBIGUOUS_SHORT_CODES.has(code)) return false;

  const guard = AMBIGUOUS_CODE_GUARDS[code];
  if (guard && guard.test(normalizedName)) {
    return false;
  }

  const row = COUNTRY_BY_CODE.get(code);
  if (!row) return true;

  return !(normalizedName.includes(row.flag) || normalizedName.includes(row.zh));
}

const RULE_REPLACEMENTS = Object.entries(rurekey)
  .map(([target, regex]) => ({
    target,
    regex,
    priority: resolveMatchPriority(target),
  }))
  .sort((a, b) => b.priority - a.priority || b.target.length - a.target.length);

function buildAllMap(inputLists, outList) {
  const map = new Map();
  for (const list of inputLists) {
    list.forEach((value, index) => {
      const key = String(value || "");
      if (!key) return;
      map.set(key, {
        value: outList[index],
        code: COUNTRY_ROWS[index] ? COUNTRY_ROWS[index].code : "",
      });
    });
  }
  return map;
}

function buildRegionEntries(allMap) {
  return Array.from(allMap.entries())
    .map(([rawKey, payload]) => {
      const key = normalizeProxyName(rawKey);
      const isShortCode = /^[A-Z]{2,3}$/.test(key);
      const isAscii = /^[\x00-\x7f]+$/.test(key);
      return {
        key,
        value: payload.value,
        code: payload.code,
        priority: resolveMatchPriority(key),
        boundary: isShortCode ? "token" : "contains",
        tokenRegex: isShortCode ? buildTokenRegex(key) : null,
        matchKey: isAscii ? key.toUpperCase() : key,
        useUpper: isAscii,
      };
    })
    .sort((a, b) => b.priority - a.priority || b.key.length - a.key.length);
}

function matchRegionKey(normalizedName, regionEntries) {
  const upperName = normalizedName.toUpperCase();

  for (const entry of regionEntries) {
    if (entry.boundary === "token") {
      if (!entry.tokenRegex.test(upperName)) {
        continue;
      }
      if (isAmbiguousShortCodeMatch(entry.code, normalizedName)) {
        continue;
      }
      return entry;
    }

    const source = entry.useUpper ? upperName : normalizedName;
    if (source.includes(entry.matchKey)) {
      return entry;
    }
  }

  return null;
}

function runDictionaryRegression(regionEntries) {
  const failures = [];

  DICTIONARY_REGRESSION_SAMPLES.forEach((sample) => {
    const normalized = normalizeProxyName(applyRuleReplacements(normalizeProxyName(sample.input)));
    const matched = matchRegionKey(normalized, regionEntries);
    const matchedCode = matched ? matched.code : "";
    if (matchedCode !== sample.expect) {
      failures.push({
        input: sample.input,
        expect: sample.expect,
        actual: matchedCode,
      });
    }
  });

  return {
    total: DICTIONARY_REGRESSION_SAMPLES.length,
    passed: DICTIONARY_REGRESSION_SAMPLES.length - failures.length,
    failures,
  };
}

function applyRuleReplacements(name) {
  let nextName = name;
  for (const item of RULE_REPLACEMENTS) {
    item.regex.lastIndex = 0;
    if (item.regex.test(nextName)) {
      item.regex.lastIndex = 0;
      nextName = nextName.replace(item.regex, item.target);
    }
  }
  return nextName;
}

function resolveRetainKey(originalName, normalizedName) {
  if (BLKEY_RULES.length === 0) return "";

  let replacement = "";
  for (const rule of BLKEY_RULES) {
    if (rule.replacement && originalName.includes(rule.source)) {
      replacement = rule.replacement;
    }
  }
  if (replacement) return replacement;

  const kept = BLKEY_RULES.map((rule) => rule.raw).filter((item) => normalizedName.includes(item));
  return kept.join(",");
}

function containsRemoveKey(normalizedName) {
  if (RMKEY_RULES.length === 0) return false;

  const upperName = normalizedName.toUpperCase();
  return RMKEY_RULES.some((token) => upperName.includes(token));
}

function applyBlockQuic(proxy) {
  if (blockquic === "on" || blockquic === "off") {
    proxy["block-quic"] = blockquic;
  } else {
    delete proxy["block-quic"];
  }
}

function getFixedTag(name) {
  if (!blgd) return "";

  let tag = "";
  regexArray.forEach((regex, index) => {
    regex.lastIndex = 0;
    if (regex.test(name)) {
      tag = valueArray[index];
    }
  });
  return tag;
}

function getMultiplierTag(name) {
  if (!bl) return "";

  const match = name.match(MULTIPLIER_CAPTURE_RE);
  if (!match) return "";

  const value = match[1] || match[2] || match[3];
  if (!value || Number(value) === 1) return "";
  return `${value}×`;
}

function operator(pro) {
  let proxies = Array.isArray(pro) ? pro.filter((item) => item && typeof item === "object") : [];

  const outList = getList(outputName);
  const inputLists = inname !== "" ? [getList(inname)] : [getList("cn"), getList("gq"), getList("quan"), getList("us")];
  const allMap = buildAllMap(inputLists, outList);
  const regionEntries = buildRegionEntries(allMap);

  if (dictcheck && typeof console !== "undefined" && typeof console.log === "function") {
    const report = runDictionaryRegression(regionEntries);
    const line = `[rename.js] dictionary regression: ${report.passed}/${report.total}`;
    if (report.failures.length === 0) {
      console.log(line);
    } else {
      console.log(`${line} (failures=${report.failures.length})`, report.failures);
    }
  }

  if (clear || nx || blnx || key || RMKEY_RULES.length > 0) {
    proxies = proxies.filter((item) => {
      const normalized = normalizeProxyName(item.name);
      return !(
        (clear && nameclear.test(normalized)) ||
        (nx && namenx.test(normalized)) ||
        (blnx && !nameblnx.test(normalized)) ||
        (RMKEY_RULES.length > 0 && containsRemoveKey(normalized)) ||
        (key && !(keya.test(normalized) && KEY_DIGIT_FILTER_RE.test(normalized)))
      );
    });
  }

  for (const proxy of proxies) {
    const sourceName = normalizeProxyName(proxy.name);
    const replacedName = applyRuleReplacements(sourceName);
    const currentName = normalizeProxyName(replacedName);

    applyBlockQuic(proxy);

    const retainKey = resolveRetainKey(sourceName, currentName);
    const multiplierTag = getMultiplierTag(currentName);
    const fixedTag = getFixedTag(currentName);
    const matchedRegion = matchRegionKey(currentName, regionEntries);

    const prefixFirst = nf ? FNAME : "";
    const prefixSecond = nf ? "" : FNAME;

    if (matchedRegion) {
      let flagValue = "";
      if (addflag) {
        const row = COUNTRY_BY_CODE.get(matchedRegion.code);
        if (row && row.flag) {
          flagValue = row.flag === "🇹🇼" ? "🇨🇳" : row.flag;
        }
      }

      proxy.name = [
        prefixFirst,
        flagValue,
        prefixSecond,
        matchedRegion.value,
        retainKey,
        multiplierTag,
        fixedTag,
      ]
        .filter((item) => item !== "")
        .join(FGF);
      continue;
    }

    if (!nm) {
      proxy.name = null;
      continue;
    }

    proxy.name = FNAME ? `${FNAME}${FGF}${currentName}` : currentName;
  }

  proxies = proxies.filter((item) => item.name !== null);
  jxh(proxies);
  if (numone) oneP(proxies);
  if (blpx) proxies = fampx(proxies);
  if (key) proxies = proxies.filter((item) => !keyb.test(item.name));

  return proxies;
}

function getList(arg) {
  const field = COUNTRY_FIELD_BY_FORMAT[arg] || "zh";
  return COUNTRY_ROWS.map((row) => row[field]);
}

function jxh(items) {
  const grouped = new Map();
  for (const item of items) {
    const name = item.name;
    if (!grouped.has(name)) {
      grouped.set(name, []);
    }
    grouped.get(name).push(item);
  }

  const expanded = [];
  for (const [name, group] of grouped.entries()) {
    group.forEach((item, index) => {
      expanded.push({ ...item, name: `${name}${XHFGF}${String(index + 1).padStart(2, "0")}` });
    });
  }

  items.splice(0, items.length, ...expanded);
  return items;
}

function oneP(items) {
  const grouped = new Map();
  for (const item of items) {
    const baseName = item.name.replace(/[^A-Za-z0-9\u00C0-\u017F\u4E00-\u9FFF]+\d+$/, "");
    if (!grouped.has(baseName)) {
      grouped.set(baseName, []);
    }
    grouped.get(baseName).push(item);
  }

  for (const group of grouped.values()) {
    if (group.length === 1 && group[0].name.endsWith("01")) {
      group[0].name = group[0].name.replace(/[^.]01$/, "");
    }
  }
  return items;
}

function fampx(proxies) {
  const withSpecial = [];
  const withoutSpecial = [];

  for (const proxy of proxies) {
    const rank = specialRegex.findIndex((regex) => {
      regex.lastIndex = 0;
      return regex.test(proxy.name);
    });

    if (rank === -1) {
      withoutSpecial.push(proxy);
      continue;
    }
    withSpecial.push({ proxy, rank });
  }

  withSpecial.sort((a, b) => a.rank - b.rank || a.proxy.name.localeCompare(b.proxy.name));
  return withoutSpecial.concat(withSpecial.map((item) => item.proxy));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    operator,
    _internal: {
      normalizeProxyName,
      buildRegionEntries,
      buildAllMap,
      getList,
      runDictionaryRegression,
    },
  };
}

