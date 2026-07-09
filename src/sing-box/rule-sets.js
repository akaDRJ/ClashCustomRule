const REMOTE_RULE_SET_BASE = 'https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/sing-box';

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
  return tags.map((tag) => ({
    type: 'remote',
    tag,
    format: 'source',
    url: `${REMOTE_RULE_SET_BASE}/${tag}.json`,
    download_detour: 'direct',
    update_interval: '24h'
  }));
}

module.exports = {
  REMOTE_RULE_SET_BASE,
  buildRemoteRuleSets,
  buildSourceRuleSet,
  ruleSetTagFromFile,
  splitDomainPayload
};
