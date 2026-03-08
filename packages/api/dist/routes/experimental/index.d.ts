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
export declare const MIGRATION_PLAN: {
    readonly memoryProposals: {
        readonly target: "los-memory";
        readonly timeline: "Milestone B";
        readonly status: "planned";
    };
    readonly incident: {
        readonly target: "VPS Agent Web";
        readonly timeline: "Milestone B+";
        readonly status: "planned";
    };
    readonly attribution: {
        readonly target: "VPS Agent Web";
        readonly timeline: "Milestone B+";
        readonly status: "planned";
    };
    readonly recovery: {
        readonly target: "VPS Agent Web";
        readonly timeline: "Milestone B+";
        readonly status: "planned";
    };
    readonly approval: {
        readonly target: "VPS Agent Web";
        readonly timeline: "Milestone B+";
        readonly status: "planned";
    };
    readonly hotreload: {
        readonly target: "los-ast-internal";
        readonly timeline: "stable";
        readonly status: "keep";
    };
    readonly evidence: {
        readonly target: "los-ast";
        readonly timeline: "stable";
        readonly status: "keep";
    };
};
//# sourceMappingURL=index.d.ts.map