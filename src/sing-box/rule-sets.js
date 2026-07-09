const REMOTE_RULE_SET_BASE = 'https://cdn.jsdelivr.net/gh/akaDRJ/ClashCustomRule@master/dist/rulesets/sing-box';
const REMOTE_GEOSITE_BASE = 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set';
const REMOTE_GEOIP_BASE = 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set';

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

    return {
      type: 'remote',
      tag,
      format: geosite || geoip ? 'binary' : 'source',
      url: geosite
        ? `${REMOTE_GEOSITE_BASE}/${tag}.srs`
        : geoip
          ? `${REMOTE_GEOIP_BASE}/${tag}.srs`
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
