# los-ast 配置指南

## 推荐方式：Root 模式（无需配置）

最简单的方式是直接指定代码目录和规则：

```bash
los-ast scan --root /path/to/project --include "src/**/*.ts" --format jsonl
```

## 项目适配器（可选）

对于团队常用项目，可以创建适配器简化命令：

### 配置文件格式

创建 `los-ast.config.json`：

```json
{
  "projects": {
    "myproject": {
      "rootDir": "/path/to/project",
      "include": ["src/**/*.ts", "lib/**/*.ts"],
      "ignore": ["node_modules/**", "dist/**"],
      "ruleGlobs": ["rules/languages/typescript/**/*.yml"]
    }
  }
}
```

### 环境变量方式

```bash
export LOS_AST_PROJECT_MYPROJECT_ROOT=/path/to/project
los-ast scan --project myproject
```

## 规则包组合策略

规则按以下顺序解析（后加载的覆盖先加载的）：

1. **语言基础包**：`rules/languages/{lang}/**/*.yml`
2. **项目扩展包**：`rules/projects/{name}/**/*.yml`
3. **显式附加包**：`--rules` 指定的额外规则

### 示例：组合规则

```bash
# 使用 TypeScript 基础规则 + 项目特定规则
los-ast scan \
  --root ./src \
  --rules "rules/languages/typescript/**/*.yml,rules/projects/myapp/**/*.yml" \
  --include "src/**/*.ts"
```

## 配置优先级

1. 命令行参数（最高）
2. 环境变量
3. 配置文件
4. 内置默认值（最低）
