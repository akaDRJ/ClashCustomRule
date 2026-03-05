#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const iniPath = path.join(rootDir, 'DRJCustomRule_3.0.ini');
const isCheckMode = process.argv.includes('--check');

global.$arguments = { regex: 'true' };
const { main, metadata } = require(path.join(rootDir, 'convert.js'));

const testUrl = 'http://cp.cloudflare.com/generate_204';

function splitRule(ruleLine) {
  return String(ruleLine || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function providerType(provider) {
  if (!provider || provider.type !== 'http') return null;
  if (provider.format === 'mrs') return null;
  if (provider.behavior === 'classical') return 'clash-classic';
  if (provider.behavior === 'ipcidr') return 'clash-ipcidr';
  if (provider.behavior === 'domain') return 'clash-domain';
  return null;
}

function buildRulesetLines(rules, ruleProviders) {
  const lines = [];
  const seen = new Set();

  for (const rule of rules) {
    const parts = splitRule(rule);
    const kind = (parts[0] || '').toLowerCase();
    let line = '';

    if (kind === 'rule-set') {
      const providerName = parts[1];
      const targetGroup = parts[2];
      const provider = ruleProviders[providerName];
      const type = providerType(provider);
      if (!provider || !type || !provider.url || !targetGroup) {
        line = `; UNSUPPORTED ${rule}`;
      } else {
        line = `ruleset=${targetGroup},${type}:${provider.url},86400`;
      }
    } else if (kind === 'geosite') {
      const geositeTag = parts[1];
      const targetGroup = parts[2];
      if (geositeTag && targetGroup) {
        line = `ruleset=${targetGroup},[]GEOSITE,${geositeTag}`;
      }
    } else if (kind === 'geoip') {
      const geoipTag = parts[1];
      const targetGroup = parts[2];
      const extra = parts.slice(3).join(',');
      if (geoipTag && targetGroup) {
        line = `ruleset=${targetGroup},[]GEOIP,${geoipTag}${extra ? `,${extra}` : ''}`;
      }
    } else if (kind === 'match') {
      const targetGroup = parts[1];
      if (targetGroup) {
        line = `ruleset=${targetGroup},[]FINAL`;
      }
    } else {
      line = `; UNSUPPORTED ${rule}`;
    }

    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }

  return lines;
}

function stripInlineCaseFlag(pattern) {
  return String(pattern || '').replace(/^\(\?i\)/i, '').trim();
}

function hasInlineCaseFlag(pattern) {
  return /^\(\?i\)/i.test(String(pattern || '').trim());
}

function buildIncludePattern(filterPattern, excludePattern) {
  const hasFilter = Boolean(filterPattern && String(filterPattern).trim());
  const hasExclude = Boolean(excludePattern && String(excludePattern).trim());

  if (!hasFilter && !hasExclude) return '.*';
  if (hasFilter && !hasExclude) return String(filterPattern).trim();

  const normalizedFilter = stripInlineCaseFlag(filterPattern);
  const normalizedExclude = stripInlineCaseFlag(excludePattern);
  const caseFlag = hasInlineCaseFlag(filterPattern) || hasInlineCaseFlag(excludePattern)
    ? '(?i)'
    : '';

  if (hasFilter && hasExclude) {
    return `${caseFlag}^(?=.*(?:${normalizedFilter}))(?!.*(?:${normalizedExclude})).*$`;
  }

  return `${caseFlag}^(?!.*(?:${normalizedExclude})).*$`;
}

function needsHealthCheck(type) {
  return ['url-test', 'fallback', 'load-balance', 'smart'].includes(type);
}

function buildGroupLine(group) {
  const name = String(group.name || '').trim();
  const type = String(group.type || '').trim();
  if (!name || !type) return '';

  const parts = [`custom_proxy_group=${name}`, type];
  const proxies = Array.isArray(group.proxies)
    ? group.proxies.filter((item) => typeof item === 'string' && item.trim())
    : [];

  if (proxies.length > 0) {
    for (const proxyName of proxies) {
      parts.push(`[]${proxyName}`);
    }
  } else if (group['include-all']) {
    parts.push(buildIncludePattern(group.filter, group['exclude-filter']));
  } else {
    parts.push('.*');
  }

  if (needsHealthCheck(type)) {
    const interval = Number.isFinite(group.interval) ? group.interval : 300;
    const tolerance = Number.isFinite(group.tolerance) ? group.tolerance : 50;
    parts.push(testUrl);
    parts.push(`${interval},,${tolerance}`);
  }

  return parts.join('`');
}

function buildProxyGroupLines(proxyGroups) {
  const lines = [];
  for (const group of proxyGroups) {
    const line = buildGroupLine(group);
    if (line) lines.push(line);
  }
  return lines;
}

function seedProxiesFromCountries(countryRegex) {
  return Object.keys(countryRegex || {}).map((countryName) => ({
    name: `${countryName} 节点`
  }));
}

function renderIni(rulesetLines, proxyGroupLines) {
  const lines = [
    '[custom]',
    '',
    '; 设置规则标志位',
    '',
    ...rulesetLines,
    '',
    '; 设置规则标志位',
    '',
    '; 设置分组标志位',
    '',
    ...proxyGroupLines,
    '',
    '; 设置分组标志位',
    ''
  ];

  return `${lines.join('\n')}\n`;
}

const ruleSeed = Array.isArray(metadata && metadata.rules) ? metadata.rules : [];
const providerSeed = (metadata && metadata.ruleProviders) || {};
const countrySeed = (metadata && metadata.countryRegex) || {};

if (!ruleSeed.length || !Object.keys(providerSeed).length) {
  throw new Error('convert.js metadata is missing required rule/provider seeds.');
}

const generatedConfig = main({
  proxies: seedProxiesFromCountries(countrySeed)
});

const rulesetLines = buildRulesetLines(ruleSeed, providerSeed);
const proxyGroupLines = buildProxyGroupLines(generatedConfig['proxy-groups'] || []);
const rendered = renderIni(rulesetLines, proxyGroupLines);
const current = fs.existsSync(iniPath) ? fs.readFileSync(iniPath, 'utf8') : '';

if (isCheckMode) {
  if (current !== rendered) {
    console.error('DRJCustomRule_3.0.ini is out of date. Run: npm run sync:drj3');
    process.exit(1);
  }
  console.log('DRJCustomRule_3.0.ini is up-to-date.');
  process.exit(0);
}

if (current === rendered) {
  console.log('No changes needed. DRJCustomRule_3.0.ini is already synced.');
  process.exit(0);
}

fs.writeFileSync(iniPath, rendered);
console.log(
  `WROTE DRJCustomRule_3.0.ini (${rulesetLines.length} rulesets, ${proxyGroupLines.length} groups).`
);
