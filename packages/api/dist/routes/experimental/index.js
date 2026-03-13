/**
 * Experimental Routes - 实验性路由
 *
 * 这些路由默认关闭，仅在 ENABLE_EXPERIMENTAL_ROUTES=true 时启用。
 * API 可能变更，不提供向后兼容保证。
 *
 * 路由列表:
 * - /experimental/memory-proposals: 经验提案 (仅 candidate 语义)
 * - /experimental/incidents: 事件管理 (将迁出至 VPS Agent Web)
 * - /experimental/attribution: 故障归因
 * - /experimental/recovery: 自动恢复 (将迁出至 VPS Agent Web)
 * - /experimental/approvals: 审批中心 (将迁出至 VPS Agent Web)
 * - /experimental/hotreload: 热重载 (开发辅助)
 * - /experimental/evidence: 证据生成
 */
export { default as memoryProposalsRoutes } from './memory-proposals.js';
export { default as incidentRoutes } from './incident.js';
export { default as attributionRoutes } from './attribution.js';
export { default as recoveryRoutes } from './recovery.js';
export { default as approvalRoutes } from './approval.js';
export { default as hotReloadRoutes } from './hotreload.js';
export { default as evidenceRoutes } from './evidence.js';
// 迁移计划标记
export const MIGRATION_PLAN = {
    memoryProposals: { target: 'los-memory', timeline: 'Milestone B', status: 'planned' },
    incident: { target: 'VPS Agent Web', timeline: 'Milestone B+', status: 'planned' },
    attribution: { target: 'VPS Agent Web', timeline: 'Milestone B+', status: 'planned' },
    recovery: { target: 'VPS Agent Web', timeline: 'Milestone B+', status: 'planned' },
    approval: { target: 'VPS Agent Web', timeline: 'Milestone B+', status: 'planned' },
    hotreload: { target: 'los-ast-internal', timeline: 'stable', status: 'keep' },
    evidence: { target: 'los-ast', timeline: 'stable', status: 'keep' },
};
