# Golden Case Fixtures

用于 Milestone A 验收的固定测试样本集。

## 目录结构

```
fixtures/golden/
├── README.md              # 本文件
├── cantool-sample/        # Rust 项目样本
├── lsclaw-sample/         # TypeScript 项目样本
└── mini-js/               # 微型 JS 项目（快速验证）
```

## 验收标准

每个 Golden Case 必须满足：

1. **结构完整**: 包含完整的项目结构（配置、源码）
2. **问题明确**: 包含已知、可预期的代码问题
3. **输出可预测**: 扫描结果应具有确定性特征

## 样本详情

### mini-js

- **用途**: 快速验证扫描功能
- **文件数**: 2 个 JS 文件
- **预期问题**:
  - `console.log` 使用
  - 未使用变量
  - 未使用函数

### cantool-sample

- **用途**: Rust 语言支持验证
- **文件数**: 2 个 RS 文件
- **预期问题**:
  - `unwrap()` 使用（应触发 no-unwrap 规则）
  - `println!` 使用
  - 未使用函数

### lsclaw-sample

- **用途**: TypeScript 中等规模项目验证
- **文件数**: 3 个 TS 文件
- **预期问题**:
  - `console.log` 使用
  - `console.error` 使用

## 使用方式

```bash
# 运行 Golden Case 测试
npm run test:golden

# 手动扫描单个样本
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{
    "scope": {
      "tenant_id": "test",
      "project_id": "golden",
      "actor_id": "tester"
    },
    "project": "mini-js",
    "rootDir": "./fixtures/golden/mini-js"
  }'
```

## 维护说明

- **禁止修改**: 一旦验收通过，不得修改样本代码
- **版本控制**: 样本输出应作为快照保存
- **新增样本**: 需经过评审，确保符合验收标准
