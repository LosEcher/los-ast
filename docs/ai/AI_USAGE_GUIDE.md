# AI 使用手册

本手册面向"会读代码、会写规则、会跑工具"的 AI Agent，目标是让变更可控、可复现、可验证。

**新版外部 agent 集成指南**: 如果你要将 los-ast 作为后端接入到自己的 agent 系统中，请先阅读 [EXTERNAL_AGENT_INTEGRATION.md](./EXTERNAL_AGENT_INTEGRATION.md)。

---

## 强制工作流

1. `scan`：先定位问题并产出 JSONL 报告
2. `fix --dry-run`：生成 diff，不落盘
3. 审阅：依据 diff 与规则 message 判断风险
4. `fix --apply`：显式写入
5. 验证：跑目标项目自带测试/构建

## 命令速查

```bash
# 扫描（只读）
npm run los-ast -- scan --project cantool --format jsonl

# 生成 diff（不落盘）
npm run los-ast -- fix --project cantool --dry-run --max-changes 20

# 真正写入
npm run los-ast -- fix --project cantool --apply --max-changes 20
```

### 自定义根目录（不走适配器）

```bash
npm run los-ast -- scan --root /abs/path/to/repo --format jsonl
```

### 解释某个位置为什么被匹配

```bash
npm run los-ast -- explain --project cantool --file /abs/path/to/file.rs --pos 120:7
```

### 环境与规则健康检查

```bash
npm run los-ast -- doctor --project cantool
```

### 启用实验性提取器（调用图 + 导入解析）

```bash
npm run los-ast -- scan --root /path --experimental-extractors --format jsonl
```

### 导出结构化 artifacts（供下游系统消费）

```bash
npm run hub-lite:artifacts -- --root /path --output-dir ./output --deterministic
```

---

## AI 输出解析建议

### JSONL 记录优先级

对每条 JSONL 记录，按优先级读取：

| 优先级 | 字段 | 用途 |
|--------|------|------|
| **高** | `ruleId` | 按规则分组，识别问题类型 |
| **高** | `severity` | 排序/筛选：error > warning > info |
| **高** | `file` | 定位到具体文件 |
| **高** | `range` | 高亮精确代码区域 |
| **高** | `message` | 向用户解释问题 |
| 中 | `excerpt` | 内联展示匹配代码 |
| 中 | `hasFix` | 判断是否可自动修复 |
| 中 | `proposedReplacement` | 展示修复后的代码 |
| 低 | `fingerprint` | 跨扫描去重，追踪修复状态 |
| 低 | `governanceDomain` | 按域过滤（security, frontend 等） |
| 低 | `impactHint` | 评估不修复的风险 |

### 对 fix 结果

读取：`proposedReplacement` 与 `diff`。

### 流式处理大结果集

```javascript
// 逐行读取 JSONL，避免内存溢出
import { createInterface } from 'node:readline';

async function* streamFindings(jsonlPath) {
  const rl = createInterface({ input: fs.createReadStream(jsonlPath) });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}
```

---

## 将扫描结果注入 AI Prompt

### 模式 1: 摘要注入

```python
def build_context_from_findings(findings: list[dict]) -> str:
    """将扫描结果压缩为 AI 可消费的上下文。"""
    by_rule = {}
    for f in findings:
        by_rule.setdefault(f["ruleId"], []).append(f)

    ctx = "## Code Scan Results\n\n"
    for rule_id, items in sorted(by_rule.items()):
        ctx += f"### {rule_id} ({len(items)} occurrences, severity: {items[0]['severity']})\n"
        ctx += f"Message: {items[0]['message']}\n"
        for f in items[:5]:  # 最多展示 5 条，避免 context window 过载
            ctx += f"- `{f['file']}:{f['range']['start']['line']}`\n"
            if f["excerpt"]:
                ctx += f"  ```\n  {f['excerpt']}\n  ```\n"
        if len(items) > 5:
            ctx += f"- ... and {len(items) - 5} more\n"
        ctx += "\n"
    return ctx
```

### 模式 2: 按文件分组

```python
def build_per_file_context(findings: list[dict]) -> dict[str, str]:
    """按文件组织 findings，适合 agent 逐个文件处理。"""
    by_file = {}
    for f in findings:
        by_file.setdefault(f["file"], []).append(f)

    contexts = {}
    for file_path, items in by_file.items():
        ctx = f"## Issues in `{file_path}`\n\n"
        for f in sorted(items, key=lambda x: x["range"]["start"]["line"]):
            ctx += f"- **L{f['range']['start']['line']}** [{f['ruleId']}] {f['message']}\n"
            if f["hasFix"]:
                ctx += f"  Fix: `{f['proposedReplacement']}`\n"
        contexts[file_path] = ctx
    return contexts
```

### 模式 3: Structure Map 注入

```python
def build_architecture_context(structure_map: dict) -> str:
    """将 structure-map.json 转为 AI 可理解的项目结构概览。"""
    ctx = "## Project Architecture\n\n"

    # 路由清单
    routes = structure_map.get("routeDeclares", [])
    if routes:
        ctx += "### Routes\n"
        for r in routes[:20]:
            ctx += f"- `{r.get('method', '?')} {r.get('path', '?')}` → `{r.get('file', '?')}`\n"
        ctx += "\n"

    # 导入热点
    imports = structure_map.get("structureImports", [])
    if imports:
        import_counts = {}
        for imp in imports:
            target = imp.get("target_path", imp.get("target"))
            if target:
                import_counts[target] = import_counts.get(target, 0) + 1
        top = sorted(import_counts.items(), key=lambda x: -x[1])[:10]
        ctx += "### Most Imported Files\n"
        for path, count in top:
            ctx += f"- `{path}` ({count} imports)\n"
        ctx += "\n"

    # 结构统计（实验性）
    ss = structure_map.get("structuralSummary")
    if ss:
        ctx += f"### Stats\n"
        ctx += f"- {ss.get('total_functions', 0)} functions, "
        ctx += f"{ss.get('total_classes', 0)} classes, "
        ctx += f"{ss.get('total_call_edges', 0)} call edges\n"

    return ctx
```

---

## 三种接入模式

| 模式 | 适用场景 | 启动方式 | 详见 |
|------|----------|----------|------|
| **CLI 子进程** | CI 流水线、一次性分析 | `npm run los-ast -- scan` | [EXTERNAL_AGENT_INTEGRATION.md](./EXTERNAL_AGENT_INTEGRATION.md#3-cli-integration) |
| **HTTP API** | 长运行 agent、可取消扫描 | `node packages/api/dist/server.js` | [EXTERNAL_AGENT_INTEGRATION.md](./EXTERNAL_AGENT_INTEGRATION.md#4-http-api-integration) |
| **Artifact 文件** | 离线分析、下游系统消费 | `npm run hub-lite:artifacts` | [EXTERNAL_AGENT_INTEGRATION.md](./EXTERNAL_AGENT_INTEGRATION.md#5-artifact-consumption) |

---

## 禁止事项

- 不允许直接对整个仓库做全文替换。
- 不允许在未 dry-run 的情况下写入。
- 不允许突破 adapter 的 root 与 ignore 约束。
- 不允许跳过 `--max-changes` 限制（默认无上限，必须显式设置）。
- 不允许对 preview 路由的响应格式做硬依赖（可能变更）。

---

## 错误处理速查

| CLI 退出码 | 含义 | Agent 动作 |
|-----------|------|-----------|
| 0 | 成功 | 解析 stdout 中的 JSONL |
| 1 | 运行时错误 | 检查 stderr，修正参数后重试 |
| 超时 | 扫描超时 | 缩小 include 范围或增加超时 |

| API 错误类别 | HTTP | 可重试 | Agent 动作 |
|-------------|------|--------|-----------|
| `VALIDATION` | 400 | 否 | 修正请求参数 |
| `SERVICE_UNAVAILABLE` | 503 | 是 | 等待 `/healthz/ready`，指数退避 |
| `TIMEOUT` | 408 | 是 | 重试，增加超时时间 |
| `SCAN_TOO_LARGE` | 413 | 否 | 缩小扫描范围 |

---

## 相关文档

- [EXTERNAL_AGENT_INTEGRATION.md](./EXTERNAL_AGENT_INTEGRATION.md) — 外部 agent 完整集成指南
- [OUTPUT_SCHEMA.md](./OUTPUT_SCHEMA.md) — JSONL 输出 schema 定义
- [PROMPTS.md](./PROMPTS.md) — AI prompt 模板资产
- [API_USAGE.md](/API_USAGE.md) — HTTP API 完整参考
- [RULE_AUTHORING.md](/docs/rules/RULE_AUTHORING.md) — 规则编写指南
