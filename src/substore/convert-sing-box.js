/*
 * convert-sing-box.js - Sub-Store 文件输出到 sing-box 配置
 *
 * 用法：在 Sub-Store 新建「文件」，脚本指向：
 * https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert-sing-box.js
 *
 * Sub-Store 没有 sing-box 专用类型时，使用「文件」输出本脚本生成的 JSON。
 * 普通文件可用 JSON 作为来源；collection=组合订阅名称 时直接调用后端生成标准 sing-box 节点。
 * Momo 1.13.x：脚本参数 momo=true；需要避开默认端口时再加 mixedPort=7899。
 */

const { buildSingBoxConfig } = require('../sing-box/config');

const runtimeArgs =
  typeof $arguments === 'object' && $arguments !== null ? $arguments : {};

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'on';
  }
  return false;
}

function parsePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function parseUsers(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('mixedUsers must be a JSON array of username/password objects');
  }
}

function normalizeInput(input) {
  if (typeof input === 'string') return normalizeInput(JSON.parse(input));
  return Array.isArray(input) ? { proxies: input } : input || {};
}

function build(config, options = {}) {
  const args = { ...runtimeArgs, ...options };
  return buildSingBoxConfig(normalizeInput(config), {
    quicEnabled: parseBool(args.quic),
    blockDot: parseBool(args.blockdot),
    momo: parseBool(args.momo),
    apiSecret: typeof args.apiSecret === 'string' ? args.apiSecret : '',
    mixedUsers: parseUsers(args.mixedUsers),
    mixedListen: args.mixedListen,
    mixedPort: parsePort(args.mixedPort, 7890),
    httpPort: parsePort(args.httpPort, 0),
    socksPort: parsePort(args.socksPort, 0)
  });
}

function main(config) {
  return `${JSON.stringify(build(config), null, 2)}\n`;
}

function operator(input) {
  if (input && typeof input === 'object' && ('$content' in input || '$files' in input)) {
    return renderFile(input);
  }
  return main(input);
}

async function renderFile(input) {
  const fileSource = JSON.parse(input.$content || '{}');
  let content = fileSource;
  if (runtimeArgs.collection) {
    if (typeof produceArtifact !== 'function') throw new Error('Sub-Store produceArtifact is unavailable');
    content = JSON.parse(await produceArtifact({ type: 'collection', name: runtimeArgs.collection, platform: 'sing-box' }));
  }
  return { ...input, $content: `${JSON.stringify(build(content, fileSource && fileSource.options || {}), null, 2)}\n` };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    build,
    main,
    operator
  };
}
