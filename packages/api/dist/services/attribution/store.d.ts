/**
 * 故障归因存储服务
 * Phase 1.3: 故障归因系统
 */
import type { Hypothesis, HypothesisStatus, CreateHypothesisRequest, EvidenceBundle, EvidenceItem, AttributionAnalysis } from '@los-ast/shared/types';
/**
 * 创建假设
 */
export declare function createHypothesis(request: CreateHypothesisRequest): Promise<Hypothesis>;
/**
 * 获取假设
 */
export declare function getHypothesis(hypothesisId: string): Promise<Hypothesis | null>;
/**
 * 更新假设状态
 */
export declare function updateHypothesisStatus(hypothesisId: string, newStatus: HypothesisStatus, confidence?: number, _actorId?: string, _reason?: string): Promise<Hypothesis | null>;
/**
 * 添加证据到假设
 */
export declare function addEvidenceToHypothesis(hypothesisId: string, evidenceItem: EvidenceItem, isSupporting: boolean): Promise<Hypothesis | null>;
/**
 * 查询假设
 */
export declare function queryHypotheses(params: {
    incident_id?: string;
    status?: HypothesisStatus;
    category?: string;
    limit?: number;
    offset?: number;
}): Promise<{
    items: Hypothesis[];
    total: number;
}>;
/**
 * 创建证据包
 */
export declare function createEvidenceBundle(incidentId: string, evidenceItems: EvidenceItem[]): Promise<EvidenceBundle>;
/**
 * 获取证据包
 */
export declare function getEvidenceBundle(bundleId: string): Promise<EvidenceBundle | null>;
/**
 * 保存归因分析
 */
export declare function saveAttributionAnalysis(analysis: AttributionAnalysis): Promise<void>;
/**
 * 获取归因分析
 */
export declare function getAttributionAnalysis(analysisId: string): Promise<AttributionAnalysis | null>;
/**
 * 获取统计信息
 */
export declare function getAttributionStats(scope?: {
    tenant_id?: string;
    project_id?: string;
}): {
    hypothesesCount: number;
    evidenceBundlesCount: number;
    analysesCount: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
};
/**
 * 清空存储 (用于测试)
 */
export declare function clearAttributionStore(): void;
//# sourceMappingURL=store.d.ts.map