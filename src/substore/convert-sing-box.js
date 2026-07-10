/*
 * convert-sing-box.js - Sub-Store 文件输出到 sing-box 配置
 *
 * 用法：在 Sub-Store 新建「文件」，脚本指向：
 * https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert-sing-box.js
 *
 * Sub-Store 没有 sing-box 专用类型时，使用「文件」输出本脚本生成的 JSON。
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

function normalizeInput(input) {
  return Array.isArray(input) ? { proxies: input } : input || {};
}

function build(config, options = {}) {
  const args = { ...runtimeArgs, ...options };
  return buildSingBoxConfig(normalizeInput(config), {
    quicEnabled: parseBool(args.quic),
    momo: parseBool(args.momo),
    mixedPort: parsePort(args.mixedPort, 7890)
  });
}

function main(config) {
  return `${JSON.stringify(build(config), null, 2)}\n`;
}

function operator(input) {
  return main(input);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    build,
    main,
    operator
  };
}
