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

- `npm run build:rules`：按单一源重新生成规则文件
- `npm run check:rules`：检查规则文件是否与单一源一致
- `npm run lint:rules`：规则重复项检查

## 推荐流程

1. 只改 `rules/src/rulesets.js`
2. 运行 `npm run build:rules`
3. 运行 `npm run check:rules`
4. 提交并推送
