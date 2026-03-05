#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const isCheckMode = process.argv.includes('--check');

global.$arguments = { regex: 'true' };
const { main, metadata } = require(path.join(rootDir, 'convert.js'));

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function seedCountryProxies() {
  return Object.keys((metadata && metadata.countryRegex) || {}).map((countryName) => ({
    name: `${countryName} 节点`
  }));
}

function formatScalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  const text = String(value);
  const isPlainSafe = /^[A-Za-z0-9_./:@+-]+$/.test(text);
  const isReserved = /^(null|true|false|yes|no|on|off|~)$/i.test(text);
  const isNumericLike = /^[-+]?\d+(\.\d+)?$/.test(text);

  if (isPlainSafe && !isReserved && !isNumericLike && !text.startsWith('-')) {
    return text;
  }

  return JSON.stringify(text);
}

function formatKey(key) {
  const text = String(key);
  if (/^[A-Za-z0-9_-]+$/.test(text)) {
    return text;
  }
  return JSON.stringify(text);
}

function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);

  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]`;

    return value
      .map((item) => {
        if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) {
          return `${pad}- ${formatScalar(item)}`;
        }

        return `${pad}-\n${toYaml(item, indent + 2)}`;
      })
      .join('\n');
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return `${pad}{}`;

    return entries
      .map(([key, child]) => {
        if (child === null || ['string', 'number', 'boolean'].includes(typeof child)) {
          return `${pad}${formatKey(key)}: ${formatScalar(child)}`;
        }

        if (Array.isArray(child) && child.length === 0) {
          return `${pad}${formatKey(key)}: []`;
        }

        if (child && typeof child === 'object' && !Array.isArray(child) && !Object.keys(child).length) {
          return `${pad}${formatKey(key)}: {}`;
        }

        return `${pad}${formatKey(key)}:\n${toYaml(child, indent + 2)}`;
      })
      .join('\n');
  }

  return `${pad}${formatScalar(value)}`;
}

function orderTopLevel(config) {
  const ordered = {};
  const preferred = [
    'proxy-providers',
    'proxies',
    'port',
    'socks-port',
    'redir-port',
    'mixed-port',
    'tproxy-port',
    'allow-lan',
    'mode',
    'log-level',
    'external-controller',
    'secret',
    'ipv6',
    'tun',
    'profile',
    'sniffer',
    'dns',
    'geodata-mode',
    'geox-url',
    'proxy-groups',
    'rule-providers',
    'rules'
  ];

  for (const key of preferred) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      ordered[key] = config[key];
    }
  }

  for (const [key, value] of Object.entries(config)) {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) {
      ordered[key] = value;
    }
  }

  return ordered;
}

function buildTargetConfig(target) {
  const seed = seedCountryProxies();
  const base = deepClone(target.base);
  const userProxies = Array.isArray(base.proxies) ? base.proxies : [];

  base.proxies = [...userProxies, ...seed];
  const generated = main(base);

  if (target.keepProxies) {
    generated.proxies = userProxies;
  } else {
    delete generated.proxies;
  }

  if (!target.keepProxyProviders) {
    delete generated['proxy-providers'];
  }

  generated['socks-port'] = target.base['socks-port'];
  generated.port = target.base.port;
  generated['mixed-port'] = target.base['mixed-port'];
  generated['redir-port'] = target.base['redir-port'];
  generated['tproxy-port'] = target.base['tproxy-port'];
  generated['allow-lan'] = target.base['allow-lan'];
  generated.mode = target.base.mode;
  generated['log-level'] = target.base['log-level'];
  generated['external-controller'] = target.base['external-controller'];
  generated.secret = target.base.secret;
  generated.ipv6 = target.base.ipv6;
  generated.tun = deepClone(target.base.tun);
  generated.profile = deepClone(target.base.profile);

  if (!generated.dns || typeof generated.dns !== 'object') {
    generated.dns = {};
  }
  generated.dns.listen = '0.0.0.0:7874';

  return orderTopLevel(generated);
}

const targets = [
  {
    file: 'config.yaml',
    keepProxies: true,
    keepProxyProviders: true,
    base: {
      'proxy-providers': {
        Nexitally: {
          url: '',
          type: 'http',
          interval: 86400,
          'health-check': {
            enable: true,
            url: 'https://www.gstatic.com/generate_204',
            interval: 300
          },
          proxy: 'Direct'
        }
      },
      proxies: [
        { name: 'Direct', type: 'direct' },
        { name: 'Reject', type: 'reject' }
      ],
      port: 7890,
      'socks-port': 7891,
      'redir-port': 7892,
      'mixed-port': 7893,
      'tproxy-port': 7895,
      'allow-lan': true,
      mode: 'rule',
      'log-level': 'info',
      'external-controller': '0.0.0.0:9090',
      secret: '123456',
      ipv6: false,
      tun: {
        enable: true,
        stack: 'gvisor',
        device: 'utun',
        'endpoint-independent-nat': true,
        'auto-route': false,
        'auto-detect-interface': false,
        'auto-redirect': false,
        'strict-route': false
      },
      profile: {
        'store-selected': true,
        'store-fake-ip': true
      }
    }
  },
  {
    file: 'config_substore.yaml',
    keepProxies: false,
    keepProxyProviders: false,
    base: {
      port: 7890,
      'socks-port': 7891,
      'redir-port': 7892,
      'mixed-port': 7893,
      'tproxy-port': 7895,
      'allow-lan': true,
      mode: 'rule',
      'log-level': 'info',
      'external-controller': '0.0.0.0:9090',
      secret: '123456',
      ipv6: false,
      tun: {
        enable: true,
        stack: 'system',
        device: 'utun',
        'endpoint-independent-nat': true,
        'auto-route': false,
        'auto-detect-interface': false,
        'auto-redirect': false,
        'strict-route': false
      },
      profile: {
        'store-selected': true,
        'store-fake-ip': true
      }
    }
  }
];

let hasDrift = false;

for (const target of targets) {
  const outputPath = path.join(rootDir, target.file);
  const generated = buildTargetConfig(target);
  const rendered = `${toYaml(generated)}\n`;
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';

  if (isCheckMode) {
    if (current !== rendered) {
      hasDrift = true;
      console.log(`OUTDATED ${target.file}`);
    } else {
      console.log(`OK ${target.file}`);
    }
    continue;
  }

  fs.writeFileSync(outputPath, rendered);
  console.log(`WROTE ${target.file}`);
}

if (isCheckMode) {
  if (hasDrift) {
    console.error('\nConfig files are out of date. Run: npm run build:configs');
    process.exit(1);
  }
  console.log('\nAll generated config files are up-to-date.');
}
