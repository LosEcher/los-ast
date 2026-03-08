/**
 * Incident 存储服务
 * Phase 1.1: Incident 数据模型与采集系统
 *
 * 当前使用内存存储，后续迁移到 PostgreSQL
 */
import type { Incident, IncidentQueryParams, IncidentListResponse, IncidentStatus, CreateIncidentRequest } from '@los-ast/shared/types';
/**
 * 创建 Incident
 */
export declare function createIncident(request: CreateIncidentRequest): Promise<Incident>;
/**
 * 获取 Incident
 */
export declare function getIncident(incidentId: string): Promise<Incident | null>;
/**
 * 更新 Incident 状态
 */
export declare function updateIncidentStatus(incidentId: string, newStatus: IncidentStatus, comment?: string, actorId?: string): Promise<Incident | null>;
/**
 * 添加假设到 Incident
 */
export declare function addHypothesisToIncident(incidentId: string, hypothesisId: string): Promise<Incident | null>;
/**
 * 添加恢复动作到 Incident
 */
export declare function addRecoveryActionToIncident(incidentId: string, actionId: string): Promise<Incident | null>;
/**
 * 查询 Incidents
 */
export declare function queryIncidents(params: IncidentQueryParams): Promise<IncidentListResponse>;
/**
 * 获取所有 Incidents (用于调试)
 */
export declare function getAllIncidents(): Incident[];
/**
 * 清空存储 (用于测试)
 */
export declare function clearStore(): void;
/**
 * 获取存储统计
 */
export declare function getStoreStats(): {
    count: number;
    byStatus: Record<string, number>;
};
export declare function getStoreStatsByScope(scope: {
    tenant_id?: string;
    project_id?: string;
}): {
    count: number;
    byStatus: Record<string, number>;
};
/**
 * 添加时间线事件
 */
export declare function addTimelineEvent(incidentId: string, type: string, description: string, actor?: string, metadata?: Record<string, unknown>): Promise<Incident | null>;
//# sourceMappingURL=store.d.ts.map