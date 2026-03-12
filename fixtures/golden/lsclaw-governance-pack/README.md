# lsclaw-governance-pack

用于固定 `rules/projects/lsclaw-governance/**/*.yml` 的最小整包回归基线。

当前基线：

- 规则总命中：`5`
- 严重级别分布：
  - `error=1`
  - `warning=3`
  - `info=1`
- impactHint 分布：
  - `high=1`
  - `medium=3`
  - `low=1`

命中规则：

- `lsclaw-governance.frontend-http-client`
- `lsclaw-governance.frontend-http-client-axios`
- `lsclaw-governance.backend-route-handler`
- `lsclaw-governance.database-concat-query`
- `lsclaw-governance.api-response-field-exposure`
