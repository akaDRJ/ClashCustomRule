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

The `openwrt=true` target uses the official sing-box 1.14+ core with TUN `auto_redirect`, a local DNS listener at `127.0.0.1:6450`, and DNS reverse mapping. sing-box handles external DNS: domestic rules use direct DoH, foreign queries use encrypted DNS through the selected proxy, and proxy server names bootstrap through direct AliDNS DoH at a fixed IP. dnsmasq can retain DHCP and local records; mosDNS is not required. An `apiSecret` enables authenticated LAN API access on port 9090; without it the API stays on loopback.

For direct access when sing-box is stopped, keep dnsmasq's upstream at `223.5.5.5` with `noresolv`: TUN `dns_mode: hijack` intercepts external port 53 while running, and normal service shutdown removes that interception. DNS sent to the router's own LAN or loopback addresses still reaches dnsmasq first, preserving local records. The loopback port 6450 remains available for direct sing-box DNS checks.

Already converted sing-box outbounds retain their protocol, TLS, transport and `detour` fields. With chained nodes, the converter creates manual `落地节点` and `前置代理` selectors; the latter defaults to ordinary URL testing over independent airport nodes. It also exposes an independent `IX节点` selector when present. Ordered fallback and Mihomo Smart are not used.

For a Sub-Store file, set the script argument `collection` to the source collection name. The script uses Sub-Store's native sing-box exporter and writes a complete JSON configuration. Use a separate file with `openwrt=true` for the router; omit it for other clients. Rule-set downloads use the independent front-proxy group (or automatic airport selection), so cold startup does not rely on blocked direct CDN access. Nodes containing unsupported `tls.certificate_sha256` pins are excluded with a warning rather than weakening certificate checks.

## Maintenance

```bash
npm run refresh:all
npm run check
```

`npm run refresh:all` rebuilds the published Sub-Store scripts, YAML/MRS/sing-box rulesets, DRJ custom rule INI, and generated configs. `npm run check` runs tests, drift checks, rule linting, and rename dictionary validation.

Generated settings are intended as a starting point. Refresh client configuration after updates and retain a working copy for rollback.

Mihomo uses the minimal domestic DNS baseline: AliDNS/DNSPod DoH in `nameserver`, with AliDNS DoT only for bootstrap (`default-nameserver`). Fake-IP and domestic real-IP exclusions remain; there are no separate direct/node resolvers, DNS proxy group, or per-domain DNS policies. LAN overrides such as `drj028.com` belong to the router's local DNS service. Routing rules, including Google Play's proxy route, remain independent of this DNS baseline.
