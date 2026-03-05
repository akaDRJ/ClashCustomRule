# ClashCustomRule

## 规则维护方式（单一源）

为避免“改目录就要同时改多个配置文件”的问题，本仓库采用：

- **单一源**：`rules/src/rulesets.js`
- **生成产物**：仓库根目录下的规则文件（文件名不变）
  - `forcedirect.yaml`
  - `forceproxy.yaml`
  - `mining.yaml`
  - `outlook.yaml`
  - `pt.yaml`
  - `steamcontent.yaml`
  - `crypto.yaml`

这样 `config*.yaml` / `.ini` 里的 URL 引用无需调整，继续指向原文件名。

## 命令

- `npm run build:rules`：按单一源重新生成规则 YAML 文件
- `npm run check:rules`：检查规则 YAML 是否与单一源一致
- `npm run build:drj3`：基于 `convert.js` 全量生成 `DRJCustomRule_3.0.ini`
- `npm run check:drj3`：检查 `DRJCustomRule_3.0.ini` 是否为最新生成结果
- `npm run refresh:drj3`：一键刷新（先生成规则 YAML，再生成 DRJ 3.0 INI）
- `npm run sync:drj3`：兼容别名（等同于 `build:drj3`）
- `npm run lint:rules`：规则重复项检查

## 推荐流程

1. 修改 `rules/src/rulesets.js` 和/或 `convert.js`
2. 运行 `npm run refresh:drj3`
3. 运行 `npm run check:rules && npm run check:drj3`
4. 提交并推送
