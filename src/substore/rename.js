/**
 * rename.js - Sub-Store 节点重命名与过滤脚本
 *
 * 功能：
 * - 自动识别节点所属国家/地区（国旗、中文、英文简写/全称）
 * - 统一输出为「国旗 + 地区名 + 序号」格式
 * - 按关键词删除/保留节点，保留倍率、ISP、线路标签等原始信息
 *
 * 使用：
 * - 在 Sub-Store 脚本操作中添加本脚本，URL 后接 # 参数
 * - 多个参数用 & 分隔；参数值会按 URL component 解码，值里含 &、=、% 等字符时请先 URL 编码
 * - 示例：https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/rename.js#flag=true&name=NX&rmkey=Premium
 * - 禁用缓存：在 URL 末尾添加 #noCache
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
 * [blockquic=on/off]  显式覆盖 block-quic；未传时保留节点原值
 * [dictcheck]         启用字典回归测试（调试模式）
 */

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
    return decodeURIComponent(String(value));
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
const COUNTRY_ROWS = Object.freeze([
  { code: "HK", zh: "香港", flag: "🇭🇰", quan: "Hong Kong" },
  { code: "MO", zh: "澳门", flag: "🇲🇴", quan: "Macao" },
  { code: "TW", zh: "台湾", flag: "🇹🇼", quan: "Taiwan" },
  { code: "JP", zh: "日本", flag: "🇯🇵", quan: "Japan" },
  { code: "KR", zh: "韩国", flag: "🇰🇷", quan: "Korea" },
  { code: "SG", zh: "新加坡", flag: "🇸🇬", quan: "Singapore" },
  { code: "US", zh: "美国", flag: "🇺🇸", quan: "United States" },
  { code: "GB", zh: "英国", flag: "🇬🇧", quan: "United Kingdom" },
  { code: "FR", zh: "法国", flag: "🇫🇷", quan: "France" },
  { code: "DE", zh: "德国", flag: "🇩🇪", quan: "Germany" },
  { code: "AU", zh: "澳大利亚", flag: "🇦🇺", quan: "Australia" },
  { code: "AE", zh: "阿联酋", flag: "🇦🇪", quan: "Dubai" },
  { code: "AF", zh: "阿富汗", flag: "🇦🇫", quan: "Afghanistan" },
  { code: "AL", zh: "阿尔巴尼亚", flag: "🇦🇱", quan: "Albania" },
  { code: "DZ", zh: "阿尔及利亚", flag: "🇩🇿", quan: "Algeria" },
  { code: "AO", zh: "安哥拉", flag: "🇦🇴", quan: "Angola" },
  { code: "AR", zh: "阿根廷", flag: "🇦🇷", quan: "Argentina" },
  { code: "AM", zh: "亚美尼亚", flag: "🇦🇲", quan: "Armenia" },
  { code: "AT", zh: "奥地利", flag: "🇦🇹", quan: "Austria" },
  { code: "AZ", zh: "阿塞拜疆", flag: "🇦🇿", quan: "Azerbaijan" },
  { code: "BH", zh: "巴林", flag: "🇧🇭", quan: "Bahrain" },
  { code: "BD", zh: "孟加拉国", flag: "🇧🇩", quan: "Bangladesh" },
  { code: "BY", zh: "白俄罗斯", flag: "🇧🇾", quan: "Belarus" },
  { code: "BE", zh: "比利时", flag: "🇧🇪", quan: "Belgium" },
  { code: "BZ", zh: "伯利兹", flag: "🇧🇿", quan: "Belize" },
  { code: "BJ", zh: "贝宁", flag: "🇧🇯", quan: "Benin" },
  { code: "BT", zh: "不丹", flag: "🇧🇹", quan: "Bhutan" },
  { code: "BO", zh: "玻利维亚", flag: "🇧🇴", quan: "Bolivia" },
  { code: "BA", zh: "波斯尼亚和黑塞哥维那", flag: "🇧🇦", quan: "Bosnia and Herzegovina" },
  { code: "BW", zh: "博茨瓦纳", flag: "🇧🇼", quan: "Botswana" },
  { code: "BR", zh: "巴西", flag: "🇧🇷", quan: "Brazil" },
  { code: "VG", zh: "英属维京群岛", flag: "🇻🇬", quan: "British Virgin Islands" },
  { code: "BN", zh: "文莱", flag: "🇧🇳", quan: "Brunei" },
  { code: "BG", zh: "保加利亚", flag: "🇧🇬", quan: "Bulgaria" },
  { code: "BF", zh: "布基纳法索", flag: "🇧🇫", quan: "Burkina-faso" },
  { code: "BI", zh: "布隆迪", flag: "🇧🇮", quan: "Burundi" },
  { code: "KH", zh: "柬埔寨", flag: "🇰🇭", quan: "Cambodia" },
  { code: "CM", zh: "喀麦隆", flag: "🇨🇲", quan: "Cameroon" },
  { code: "CA", zh: "加拿大", flag: "🇨🇦", quan: "Canada" },
  { code: "CV", zh: "佛得角", flag: "🇨🇻", quan: "CapeVerde" },
  { code: "KY", zh: "开曼群岛", flag: "🇰🇾", quan: "CaymanIslands" },
  { code: "CF", zh: "中非共和国", flag: "🇨🇫", quan: "Central African Republic" },
  { code: "TD", zh: "乍得", flag: "🇹🇩", quan: "Chad" },
  { code: "CL", zh: "智利", flag: "🇨🇱", quan: "Chile" },
  { code: "CO", zh: "哥伦比亚", flag: "🇨🇴", quan: "Colombia" },
  { code: "KM", zh: "科摩罗", flag: "🇰🇲", quan: "Comoros" },
  { code: "CG", zh: "刚果(布)", flag: "🇨🇬", quan: "Congo-Brazzaville" },
  { code: "CD", zh: "刚果(金)", flag: "🇨🇩", quan: "Congo-Kinshasa" },
  { code: "CR", zh: "哥斯达黎加", flag: "🇨🇷", quan: "CostaRica" },
  { code: "HR", zh: "克罗地亚", flag: "🇭🇷", quan: "Croatia" },
  { code: "CY", zh: "塞浦路斯", flag: "🇨🇾", quan: "Cyprus" },
  { code: "CZ", zh: "捷克", flag: "🇨🇿", quan: "Czech Republic" },
  { code: "DK", zh: "丹麦", flag: "🇩🇰", quan: "Denmark" },
  { code: "DJ", zh: "吉布提", flag: "🇩🇯", quan: "Djibouti" },
  { code: "DO", zh: "多米尼加共和国", flag: "🇩🇴", quan: "Dominican Republic" },
  { code: "EC", zh: "厄瓜多尔", flag: "🇪🇨", quan: "Ecuador" },
  { code: "EG", zh: "埃及", flag: "🇪🇬", quan: "Egypt" },
  { code: "SV", zh: "萨尔瓦多", flag: "🇸🇻", quan: "EISalvador" },
  { code: "GQ", zh: "赤道几内亚", flag: "🇬🇶", quan: "Equatorial Guinea" },
  { code: "ER", zh: "厄立特里亚", flag: "🇪🇷", quan: "Eritrea" },
  { code: "EE", zh: "爱沙尼亚", flag: "🇪🇪", quan: "Estonia" },
  { code: "ET", zh: "埃塞俄比亚", flag: "🇪🇹", quan: "Ethiopia" },
  { code: "FJ", zh: "斐济", flag: "🇫🇯", quan: "Fiji" },
  { code: "FI", zh: "芬兰", flag: "🇫🇮", quan: "Finland" },
  { code: "GA", zh: "加蓬", flag: "🇬🇦", quan: "Gabon" },
  { code: "GM", zh: "冈比亚", flag: "🇬🇲", quan: "Gambia" },
  { code: "GE", zh: "格鲁吉亚", flag: "🇬🇪", quan: "Georgia" },
  { code: "GH", zh: "加纳", flag: "🇬🇭", quan: "Ghana" },
  { code: "GR", zh: "希腊", flag: "🇬🇷", quan: "Greece" },
  { code: "GL", zh: "格陵兰", flag: "🇬🇱", quan: "Greenland" },
  { code: "GT", zh: "危地马拉", flag: "🇬🇹", quan: "Guatemala" },
  { code: "GN", zh: "几内亚", flag: "🇬🇳", quan: "Guinea" },
  { code: "GY", zh: "圭亚那", flag: "🇬🇾", quan: "Guyana" },
  { code: "HT", zh: "海地", flag: "🇭🇹", quan: "Haiti" },
  { code: "HN", zh: "洪都拉斯", flag: "🇭🇳", quan: "Honduras" },
  { code: "HU", zh: "匈牙利", flag: "🇭🇺", quan: "Hungary" },
  { code: "IS", zh: "冰岛", flag: "🇮🇸", quan: "Iceland" },
  { code: "IN", zh: "印度", flag: "🇮🇳", quan: "India" },
  { code: "ID", zh: "印尼", flag: "🇮🇩", quan: "Indonesia" },
  { code: "IR", zh: "伊朗", flag: "🇮🇷", quan: "Iran" },
  { code: "IQ", zh: "伊拉克", flag: "🇮🇶", quan: "Iraq" },
  { code: "IE", zh: "爱尔兰", flag: "🇮🇪", quan: "Ireland" },
  { code: "IM", zh: "马恩岛", flag: "🇮🇲", quan: "Isle of Man" },
  { code: "IL", zh: "以色列", flag: "🇮🇱", quan: "Israel" },
  { code: "IT", zh: "意大利", flag: "🇮🇹", quan: "Italy" },
  { code: "CI", zh: "科特迪瓦", flag: "🇨🇮", quan: "Ivory Coast" },
  { code: "JM", zh: "牙买加", flag: "🇯🇲", quan: "Jamaica" },
  { code: "JO", zh: "约旦", flag: "🇯🇴", quan: "Jordan" },
  { code: "KZ", zh: "哈萨克斯坦", flag: "🇰🇿", quan: "Kazakstan" },
  { code: "KE", zh: "肯尼亚", flag: "🇰🇪", quan: "Kenya" },
  { code: "KW", zh: "科威特", flag: "🇰🇼", quan: "Kuwait" },
  { code: "KG", zh: "吉尔吉斯斯坦", flag: "🇰🇬", quan: "Kyrgyzstan" },
  { code: "LA", zh: "老挝", flag: "🇱🇦", quan: "Laos" },
  { code: "LV", zh: "拉脱维亚", flag: "🇱🇻", quan: "Latvia" },
  { code: "LB", zh: "黎巴嫩", flag: "🇱🇧", quan: "Lebanon" },
  { code: "LS", zh: "莱索托", flag: "🇱🇸", quan: "Lesotho" },
  { code: "LR", zh: "利比里亚", flag: "🇱🇷", quan: "Liberia" },
  { code: "LY", zh: "利比亚", flag: "🇱🇾", quan: "Libya" },
  { code: "LT", zh: "立陶宛", flag: "🇱🇹", quan: "Lithuania" },
  { code: "LU", zh: "卢森堡", flag: "🇱🇺", quan: "Luxembourg" },
  { code: "MK", zh: "马其顿", flag: "🇲🇰", quan: "Macedonia" },
  { code: "MG", zh: "马达加斯加", flag: "🇲🇬", quan: "Madagascar" },
  { code: "MW", zh: "马拉维", flag: "🇲🇼", quan: "Malawi" },
  { code: "MY", zh: "马来", flag: "🇲🇾", quan: "Malaysia" },
  { code: "MV", zh: "马尔代夫", flag: "🇲🇻", quan: "Maldives" },
  { code: "ML", zh: "马里", flag: "🇲🇱", quan: "Mali" },
  { code: "MT", zh: "马耳他", flag: "🇲🇹", quan: "Malta" },
  { code: "MR", zh: "毛利塔尼亚", flag: "🇲🇷", quan: "Mauritania" },
  { code: "MU", zh: "毛里求斯", flag: "🇲🇺", quan: "Mauritius" },
  { code: "MX", zh: "墨西哥", flag: "🇲🇽", quan: "Mexico" },
  { code: "MD", zh: "摩尔多瓦", flag: "🇲🇩", quan: "Moldova" },
  { code: "MC", zh: "摩纳哥", flag: "🇲🇨", quan: "Monaco" },
  { code: "MN", zh: "蒙古", flag: "🇲🇳", quan: "Mongolia" },
  { code: "ME", zh: "黑山共和国", flag: "🇲🇪", quan: "Montenegro" },
  { code: "MA", zh: "摩洛哥", flag: "🇲🇦", quan: "Morocco" },
  { code: "MZ", zh: "莫桑比克", flag: "🇲🇿", quan: "Mozambique" },
  { code: "MM", zh: "缅甸", flag: "🇲🇲", quan: "Myanmar(Burma)" },
  { code: "NA", zh: "纳米比亚", flag: "🇳🇦", quan: "Namibia" },
  { code: "NP", zh: "尼泊尔", flag: "🇳🇵", quan: "Nepal" },
  { code: "NL", zh: "荷兰", flag: "🇳🇱", quan: "Netherlands" },
  { code: "NZ", zh: "新西兰", flag: "🇳🇿", quan: "New Zealand" },
  { code: "NI", zh: "尼加拉瓜", flag: "🇳🇮", quan: "Nicaragua" },
  { code: "NE", zh: "尼日尔", flag: "🇳🇪", quan: "Niger" },
  { code: "NG", zh: "尼日利亚", flag: "🇳🇬", quan: "Nigeria" },
  { code: "KP", zh: "朝鲜", flag: "🇰🇵", quan: "NorthKorea" },
  { code: "NO", zh: "挪威", flag: "🇳🇴", quan: "Norway" },
  { code: "OM", zh: "阿曼", flag: "🇴🇲", quan: "Oman" },
  { code: "PK", zh: "巴基斯坦", flag: "🇵🇰", quan: "Pakistan" },
  { code: "PA", zh: "巴拿马", flag: "🇵🇦", quan: "Panama" },
  { code: "PY", zh: "巴拉圭", flag: "🇵🇾", quan: "Paraguay" },
  { code: "PE", zh: "秘鲁", flag: "🇵🇪", quan: "Peru" },
  { code: "PH", zh: "菲律宾", flag: "🇵🇭", quan: "Philippines" },
  { code: "PT", zh: "葡萄牙", flag: "🇵🇹", quan: "Portugal" },
  { code: "PR", zh: "波多黎各", flag: "🇵🇷", quan: "PuertoRico" },
  { code: "QA", zh: "卡塔尔", flag: "🇶🇦", quan: "Qatar" },
  { code: "RO", zh: "罗马尼亚", flag: "🇷🇴", quan: "Romania" },
  { code: "RU", zh: "俄罗斯", flag: "🇷🇺", quan: "Russia" },
  { code: "RW", zh: "卢旺达", flag: "🇷🇼", quan: "Rwanda" },
  { code: "SM", zh: "圣马力诺", flag: "🇸🇲", quan: "SanMarino" },
  { code: "SA", zh: "沙特阿拉伯", flag: "🇸🇦", quan: "SaudiArabia" },
  { code: "SN", zh: "塞内加尔", flag: "🇸🇳", quan: "Senegal" },
  { code: "RS", zh: "塞尔维亚", flag: "🇷🇸", quan: "Serbia" },
  { code: "SL", zh: "塞拉利昂", flag: "🇸🇱", quan: "SierraLeone" },
  { code: "SK", zh: "斯洛伐克", flag: "🇸🇰", quan: "Slovakia" },
  { code: "SI", zh: "斯洛文尼亚", flag: "🇸🇮", quan: "Slovenia" },
  { code: "SO", zh: "索马里", flag: "🇸🇴", quan: "Somalia" },
  { code: "ZA", zh: "南非", flag: "🇿🇦", quan: "SouthAfrica" },
  { code: "ES", zh: "西班牙", flag: "🇪🇸", quan: "Spain" },
  { code: "LK", zh: "斯里兰卡", flag: "🇱🇰", quan: "SriLanka" },
  { code: "SD", zh: "苏丹", flag: "🇸🇩", quan: "Sudan" },
  { code: "SR", zh: "苏里南", flag: "🇸🇷", quan: "Suriname" },
  { code: "SZ", zh: "斯威士兰", flag: "🇸🇿", quan: "Swaziland" },
  { code: "SE", zh: "瑞典", flag: "🇸🇪", quan: "Sweden" },
  { code: "CH", zh: "瑞士", flag: "🇨🇭", quan: "Switzerland" },
  { code: "SY", zh: "叙利亚", flag: "🇸🇾", quan: "Syria" },
  { code: "TJ", zh: "塔吉克斯坦", flag: "🇹🇯", quan: "Tajikstan" },
  { code: "TZ", zh: "坦桑尼亚", flag: "🇹🇿", quan: "Tanzania" },
  { code: "TH", zh: "泰国", flag: "🇹🇭", quan: "Thailand" },
  { code: "TG", zh: "多哥", flag: "🇹🇬", quan: "Togo" },
  { code: "TO", zh: "汤加", flag: "🇹🇴", quan: "Tonga" },
  { code: "TT", zh: "特立尼达和多巴哥", flag: "🇹🇹", quan: "TrinidadandTobago" },
  { code: "TN", zh: "突尼斯", flag: "🇹🇳", quan: "Tunisia" },
  { code: "TR", zh: "土耳其", flag: "🇹🇷", quan: "Turkey" },
  { code: "TM", zh: "土库曼斯坦", flag: "🇹🇲", quan: "Turkmenistan" },
  { code: "VI", zh: "美属维尔京群岛", flag: "🇻🇮", quan: "U.S.Virgin Islands" },
  { code: "UG", zh: "乌干达", flag: "🇺🇬", quan: "Uganda" },
  { code: "UA", zh: "乌克兰", flag: "🇺🇦", quan: "Ukraine" },
  { code: "UY", zh: "乌拉圭", flag: "🇺🇾", quan: "Uruguay" },
  { code: "UZ", zh: "乌兹别克斯坦", flag: "🇺🇿", quan: "Uzbekistan" },
  { code: "VE", zh: "委内瑞拉", flag: "🇻🇪", quan: "Venezuela" },
  { code: "VN", zh: "越南", flag: "🇻🇳", quan: "Vietnam" },
  { code: "YE", zh: "也门", flag: "🇾🇪", quan: "Yemen" },
  { code: "ZM", zh: "赞比亚", flag: "🇿🇲", quan: "Zambia" },
  { code: "ZW", zh: "津巴布韦", flag: "🇿🇼", quan: "Zimbabwe" },
  { code: "AD", zh: "安道尔", flag: "🇦🇩", quan: "Andorra" },
  { code: "RE", zh: "留尼汪", flag: "🇷🇪", quan: "Reunion" },
  { code: "PL", zh: "波兰", flag: "🇵🇱", quan: "Poland" },
  { code: "GU", zh: "关岛", flag: "🇬🇺", quan: "Guam" },
  { code: "VA", zh: "梵蒂冈", flag: "🇻🇦", quan: "Vatican" },
  { code: "LI", zh: "列支敦士登", flag: "🇱🇮", quan: "Liechtensteins" },
  { code: "CW", zh: "库拉索", flag: "🇨🇼", quan: "Curacao" },
  { code: "SC", zh: "塞舌尔", flag: "🇸🇨", quan: "Seychelles" },
  { code: "AQ", zh: "南极", flag: "🇦🇶", quan: "Antarctica" },
  { code: "GI", zh: "直布罗陀", flag: "🇬🇮", quan: "Gibraltar" },
  { code: "CU", zh: "古巴", flag: "🇨🇺", quan: "Cuba" },
  { code: "FO", zh: "法罗群岛", flag: "🇫🇴", quan: "Faroe Islands" },
  { code: "AX", zh: "奥兰群岛", flag: "🇦🇽", quan: "Ahvenanmaa" },
  { code: "BM", zh: "百慕达", flag: "🇧🇲", quan: "Bermuda" },
  { code: "TL", zh: "东帝汶", flag: "🇹🇱", quan: "Timor-Leste" }
]);

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
    const suffix = `${XHFGF}01`;
    if (group.length === 1 && group[0].name.endsWith(suffix)) {
      group[0].name = group[0].name.slice(0, -suffix.length);
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
      COUNTRY_ROWS,
      normalizeProxyName,
      buildRegionEntries,
      buildAllMap,
      getList,
      runDictionaryRegression,
    },
  };
}
