# ClashCustomRule

Clash/Mihomo and Sub-Store rule maintenance repo.

## Directory Layout

```text
src/
  substore/        Source scripts for Sub-Store conversion and node renaming.
  data/            Canonical ruleset source data.

dist/
  substore/        Published Sub-Store scripts.
  configs/         Generated Clash/Mihomo configs and DRJCustomRule_3.0.ini.
  rulesets/yaml/   Generated YAML rulesets.
  rulesets/mrs/    Generated MRS rulesets.

scripts/           Build, sync, lint, and consistency checks.
test/              Regression tests.
legacy/            Archived scripts kept for reference only.
```

Source files live under `src/`. Generated files live under `dist/`. The repo root is reserved for project metadata and tooling.

## Public URLs

Sub-Store scripts:

```text
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert.js
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert-akcdn-fallback.js
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/rename.js
```

Generated configs:

```text
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/configs/config.yaml
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/configs/config_substore.yaml
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/configs/DRJCustomRule_3.0.ini
```

Generated rulesets:

```text
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/yaml/<name>.yaml
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/mrs/<name>.mrs
```

## Maintenance

```bash
npm run refresh:all
npm run check
```

`npm run refresh:all` rebuilds the published Sub-Store scripts, YAML/MRS rulesets, DRJ custom rule INI, and generated configs. `npm run check` runs tests, drift checks, rule linting, and rename dictionary validation.
