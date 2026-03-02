"use strict";

const path = require("path");
const rename = require(path.resolve(__dirname, "../rename.js"));

if (!rename || !rename._internal) {
  console.error("[check-rename-dictionary] rename.js internal helpers are unavailable");
  process.exit(2);
}

const { getList, buildAllMap, buildRegionEntries, runDictionaryRegression } = rename._internal;

const outList = getList("us");
const inputLists = [getList("cn"), getList("gq"), getList("quan"), getList("us")];
const regionEntries = buildRegionEntries(buildAllMap(inputLists, outList));
const report = runDictionaryRegression(regionEntries);

console.log(`[check-rename-dictionary] ${report.passed}/${report.total} passed`);
if (report.failures.length > 0) {
  console.error("[check-rename-dictionary] failures:");
  for (const item of report.failures) {
    console.error(`- input=${JSON.stringify(item.input)} expect=${item.expect} actual=${item.actual}`);
  }
  process.exit(1);
}
