# cantool 适配器

## 目标仓库

- 默认路径：`/Users/echerlos/Downloads/projects/cantool`

## 语言范围

- Rust（src-tauri/src, src-tauri/tests, scripts）
- TypeScript/TSX（frontend/src）
- JavaScript/JSX（向后兼容）

## 文件范围

- `src-tauri/src/**/*.rs` - Rust后端源码
- `src-tauri/tests/**/*.rs` - Rust测试
- `frontend/src/**/*.{ts,tsx,js,jsx}` - 前端源码
- `scripts/**/*.rs` - 构建/分析脚本

## 默认忽略

- `**/node_modules/**`
- `**/target/**`
- `**/dist/**`
- `**/.git/**`

## 默认规则包

- `cantool:default` - 项目特定规则

### 项目特定规则 (rules/projects/cantool/)

| 规则ID | 用途 |
|--------|------|
| `cantool.rust.no-panic` | 禁止使用panic |
| `cantool.rust.async-function` | 核心功能使用async |
| `cantool.rust.database-usage` | 推荐使用database模块 |
| `cantool.rust.deprecated-db` | 禁止使用弃用的db.rs |
| `cantool.rust.feature-flags` | 使用feature flags |
| `cantool.typescript.type-safety` | 函数类型注解 |
| `cantool.typescript.no-any` | 禁止any类型 |

### 语言规则 (rules/languages/)

- Rust: `no-unwrap`, `no-panic`
- TypeScript: `no-console-log`, `type-safety`
- TSX: `no-console-log`

## 重构状态

- ✅ Phase 1: 核心稳定性 - 已完成
- ✅ Phase 2: 类型系统完善 - 部分完成
- 🔄 前端: JavaScript → TypeScript 迁移中
- ✅ 后端: 数据库层重构完成 (sqlx)
