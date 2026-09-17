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
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert-sing-box.js
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
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/sing-box/<name>.json
```

For sing-box via Sub-Store, create a Sub-Store "file" output and attach `dist/substore/convert-sing-box.js`; Sub-Store does not need a dedicated sing-box output type for this flow.

## Maintenance

```bash
npm run refresh:all
npm run check
```

`npm run refresh:all` rebuilds the published Sub-Store scripts, YAML/MRS/sing-box rulesets, DRJ custom rule INI, and generated configs. `npm run check` runs tests, drift checks, rule linting, and rename dictionary validation.

## Routing policy

- Private destinations take priority; custom exceptions precede service categories.
- AI precedes developer resources so Copilot and JetBrains AI use the AI policy.
- Google Play uses the Google policy; its DNS exception precedes domestic DNS in both clients.
- With `quic=false` (default), UDP 443 is rejected at each proxy-policy match and at the final proxy fallback. Direct-policy matches remain allowed. This follows the configured policy category, not the selector's runtime choice. Set `quic=true` to allow UDP 443 everywhere.
- sing-box no longer blocks port 853 as a side effect of `quic=false`. Use `blockdot=true` only when intentionally blocking client DoT/DoQ.
- Mihomo defaults to daily Geo updates, preserving an input config's explicit `geo-auto-update` and `geo-update-interval`. Use `geoupdate=false` when OpenClash manages these downloads; use `geoupdate=true` to explicitly enable core-managed updates.
- Fake-IP uses `198.18.0.1/16`. When upgrading from `198.20.0.1/16`, refresh the generated config and restart the client to clear old mappings; update any manually maintained Fake-IP routes/firewall ranges too.
- `steamcontent` remains published for external subscribers, although the bundled policies use the upstream game-download categories. The PT list omits `drj028.com` because the earlier `forcedirect` list already covers it.

Text files use LF via `.gitattributes` so Windows checkouts pass generation checks.
