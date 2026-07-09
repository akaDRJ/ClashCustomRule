/*
 * convert-sing-box.js - Sub-Store 文件输出到 sing-box 配置
 *
 * 用法：在 Sub-Store 新建「文件」，脚本指向：
 * https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert-sing-box.js
 *
 * Sub-Store 没有 sing-box 专用类型时，使用「文件」输出本脚本生成的 JSON。
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

function normalizeInput(input) {
  return Array.isArray(input) ? { proxies: input } : input || {};
}

function main(config) {
  return buildSingBoxConfig(normalizeInput(config), {
    quicEnabled: parseBool(runtimeArgs.quic)
  });
}

function operator(input) {
  return `${JSON.stringify(main(input), null, 2)}\n`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    main,
    operator
  };
}
