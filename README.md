# ClashCustomRule

Jin 的 Clash / Sub-Store 自定义规则仓库。

## 目标

- 统一维护 `.ini` 与 `.yaml` 规则文件
- 支持不同场景（强制代理/直连、挖矿、Outlook、PT、Crypto 等）
- 提供基础自检脚本，减少重复规则和格式错误

## 文件说明

### 1) 主配置文件

- `config.yaml`：主配置模板
- `config_u.yaml`：变体配置（U）
- `config_substore.yaml`：Sub-Store 版本配置
- `config_u_substore.yaml`：U + Sub-Store 版本

### 2) 规则集（YAML）

- `forcedirect.yaml`：强制直连规则
- `forceproxy.yaml`：强制代理规则
- `mining.yaml`：挖矿相关规则
- `outlook.yaml`：Outlook 相关规则
- `pt.yaml`：PT 相关规则
- `crypto.yaml`：加密货币相关规则
- `steamcontent.yaml`：Steam 内容分发相关规则
- `rule_provider_config.yaml`：Rule Provider 汇总与配置

### 3) INI 规则

- `DRJCustomRule_2.0.ini`
- `DRJCustomRule_3.0.ini`
- `DRJCustomRule_B2C.ini`
- `DRJCustomRule_M.ini`

### 4) 脚本

- `convert.js`：规则转换/处理脚本
- `test.js` / `test2.js`：测试或处理脚本
- `scripts/lint-rules.js`：基线自检（本次新增）

## 基线维护规范

- 新规则优先追加，不随意改历史规则语义
- 提交信息遵循：`type(scope): summary`
  - 例：`chore(rules): add outlook direct rule`
- 每次改动后先跑一遍自检：

```bash
# 默认：发现重复会警告，但不中断
node scripts/lint-rules.js

# 严格模式：发现重复直接失败（适合 CI）
node scripts/lint-rules.js --strict
```

## 快速开始

```bash
# 克隆
git clone https://github.com/akaDRJ/ClashCustomRule.git
cd ClashCustomRule

# 自检
node scripts/lint-rules.js
```

---

如需我继续接管维护，下一步建议：
1. 增加 CI（PR 自动跑 lint）
2. 将规则按 domain/ip-cidr/process-name 分目录沉淀
3. 生成变更日志（每次发布可追溯）
