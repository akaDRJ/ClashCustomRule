const REMOTE_RULE_SET_BASE = 'https://cdn.jsdelivr.net/gh/akaDRJ/ClashCustomRule@master/dist/rulesets/sing-box';
const REMOTE_GEOSITE_BASE = 'https://cdn.jsdelivr.net/gh/appshubcc/bett-rules@sing/geo/geosite';
const REMOTE_GEOIP_BASE = 'https://cdn.jsdelivr.net/gh/appshubcc/bett-rules@sing/geo/geoip';

function ruleSetTagFromFile(fileName) {
  return fileName.replace(/\.ya?ml$/i, '');
}

function splitDomainPayload(payload) {
  const domain = [];
  const domainSuffix = [];

  for (const item of payload) {
    if (typeof item !== 'string') continue;
    const value = item.trim();
    if (!value) continue;

    if (value.startsWith('+.')) {
      const root = value.slice(2);
      domain.push(root);
      domainSuffix.push(`.${root}`);
      continue;
    }

    domain.push(value);
  }

  return { domain, domainSuffix };
}

function buildSourceRuleSet(payload) {
  const { domain, domainSuffix } = splitDomainPayload(payload);
  const rule = {};

  if (domain.length) rule.domain = domain;
  if (domainSuffix.length) rule.domain_suffix = domainSuffix;

  return {
    version: 3,
    rules: Object.keys(rule).length ? [rule] : []
  };
}

function buildRemoteRuleSets(tags) {
  return tags.map((tag) => {
    const geosite = tag.startsWith('geosite-');
    const geoip = tag.startsWith('geoip-');
    const assetName = geosite
      ? tag.slice('geosite-'.length)
      : geoip
        ? tag.slice('geoip-'.length)
        : tag;

    return {
      type: 'remote',
      tag,
      format: geosite || geoip ? 'binary' : 'source',
      url: geosite
        ? `${REMOTE_GEOSITE_BASE}/${assetName}.srs`
        : geoip
          ? `${REMOTE_GEOIP_BASE}/${assetName}.srs`
          : `${REMOTE_RULE_SET_BASE}/${tag}.json`,
      update_interval: '24h'
    };
  });
}

module.exports = {
  REMOTE_GEOIP_BASE,
  REMOTE_GEOSITE_BASE,
  REMOTE_RULE_SET_BASE,
  buildRemoteRuleSets,
  buildSourceRuleSet,
  ruleSetTagFromFile,
  splitDomainPayload
};
