/**
 * 故障归因存储服务
 * Phase 1.3: 故障归因系统
 */
import { generateId } from '../../utils/id-generator.js';
import { getAllIncidents } from '../incident/store.js';
// 内存存储
const hypothesisStore = new Map();
const evidenceBundleStore = new Map();
const attributionAnalysisStore = new Map();
/**
 * 创建假设
 */
export async function createHypothesis(request) {
    const now = new Date().toISOString();
    const hypothesisId = generateId('hyp');
    const hypothesis = {
        hypothesis_id: hypothesisId,
        incident_id: request.incident_id,
        title: request.title,
        description: request.description,
        category: request.category,
        status: 'proposed',
        confidence: 0.5,
        root_cause: request.root_cause,
        evidence: {
            supporting: [],
            contradicting: [],
            bundle_id: request.evidence_bundle_id,
        },
        proposed_by: request.proposed_by,
        created_at: now,
        updated_at: now,
        version: 1,
    };
    hypothesisStore.set(hypothesisId, hypothesis);
    console.log(`[AttributionStore] Created hypothesis ${hypothesisId}: ${hypothesis.title}`);
    return hypothesis;
}
/**
 * 获取假设
 */
export async function getHypothesis(hypothesisId) {
    return hypothesisStore.get(hypothesisId) || null;
}
/**
 * 更新假设状态
 */
export async function updateHypothesisStatus(hypothesisId, newStatus, confidence, _actorId, _reason) {
    const hypothesis = hypothesisStore.get(hypothesisId);
    if (!hypothesis) {
        return null;
    }
    hypothesis.status = newStatus;
    if (confidence !== undefined) {
        hypothesis.confidence = confidence;
    }
    hypothesis.updated_at = new Date().toISOString();
    hypothesis.version += 1;
    hypothesisStore.set(hypothesisId, hypothesis);
    console.log(`[AttributionStore] Updated hypothesis ${hypothesisId} status to ${newStatus}`);
    return hypothesis;
}
/**
 * 添加证据到假设
 */
export async function addEvidenceToHypothesis(hypothesisId, evidenceItem, isSupporting) {
    const hypothesis = hypothesisStore.get(hypothesisId);
    if (!hypothesis) {
        return null;
    }
    const evidenceRef = {
        evidence_id: evidenceItem.item_id,
        evidence_type: evidenceItem.type,
        description: `Evidence from ${evidenceItem.source}`,
        relevance_score: 0.8,
        timestamp: evidenceItem.timestamp,
    };
    if (isSupporting) {
        hypothesis.evidence.supporting.push(evidenceRef);
    }
    else {
        hypothesis.evidence.contradicting.push(evidenceRef);
    }
    hypothesis.updated_at = new Date().toISOString();
    hypothesis.version += 1;
    hypothesisStore.set(hypothesisId, hypothesis);
    return hypothesis;
}
/**
 * 查询假设
 */
export async function queryHypotheses(params) {
    let items = Array.from(hypothesisStore.values());
    if (params.incident_id) {
        items = items.filter((h) => h.incident_id === params.incident_id);
    }
    if (params.status) {
        items = items.filter((h) => h.status === params.status);
    }
    if (params.category) {
        items = items.filter((h) => h.category === params.category);
    }
    const total = items.length;
    const offset = params.offset || 0;
    const limit = params.limit || 20;
    items = items.slice(offset, offset + limit);
    return { items, total };
}
/**
 * 创建证据包
 */
export async function createEvidenceBundle(incidentId, evidenceItems) {
    const bundleId = generateId('evd');
    const bundle = {
        bundle_id: bundleId,
        incident_id: incidentId,
        collected_at: new Date().toISOString(),
        evidence_items: evidenceItems,
    };
    evidenceBundleStore.set(bundleId, bundle);
    console.log(`[AttributionStore] Created evidence bundle ${bundleId} with ${evidenceItems.length} items`);
    return bundle;
}
/**
 * 获取证据包
 */
export async function getEvidenceBundle(bundleId) {
    return evidenceBundleStore.get(bundleId) || null;
}
/**
 * 保存归因分析
 */
export async function saveAttributionAnalysis(analysis) {
    attributionAnalysisStore.set(analysis.analysis_id, analysis);
    console.log(`[AttributionStore] Saved attribution analysis ${analysis.analysis_id}`);
}
/**
 * 获取归因分析
 */
export async function getAttributionAnalysis(analysisId) {
    return attributionAnalysisStore.get(analysisId) || null;
}
function buildScopedIncidentIds(scope) {
    if (!scope?.tenant_id && !scope?.project_id) {
        return new Set(getAllIncidents().map((incident) => incident.incident_id));
    }
    return new Set(getAllIncidents()
        .filter((incident) => {
        if (scope.tenant_id && incident.scope.tenant_id !== scope.tenant_id) {
            return false;
        }
        if (scope.project_id && incident.scope.project_id !== scope.project_id) {
            return false;
        }
        return true;
    })
        .map((incident) => incident.incident_id));
}
/**
 * 获取统计信息
 */
export function getAttributionStats(scope) {
    const scopedIncidentIds = buildScopedIncidentIds(scope);
    const hypotheses = Array.from(hypothesisStore.values()).filter((hypothesis) => scopedIncidentIds.has(hypothesis.incident_id));
    const evidenceBundles = Array.from(evidenceBundleStore.values()).filter((bundle) => scopedIncidentIds.has(bundle.incident_id));
    const analyses = Array.from(attributionAnalysisStore.values()).filter((analysis) => {
        if (analysis.scope?.tenant_id || analysis.scope?.project_id) {
            if (scope?.tenant_id && analysis.scope?.tenant_id !== scope.tenant_id) {
                return false;
            }
            if (scope?.project_id && analysis.scope?.project_id !== scope.project_id) {
                return false;
            }
            return true;
        }
        return scopedIncidentIds.has(analysis.incident_id);
    });
    const byCategory = {};
    const byStatus = {};
    for (const h of hypotheses) {
        byCategory[h.category] = (byCategory[h.category] || 0) + 1;
        byStatus[h.status] = (byStatus[h.status] || 0) + 1;
    }
    return {
        hypothesesCount: hypotheses.length,
        evidenceBundlesCount: evidenceBundles.length,
        analysesCount: analyses.length,
        byCategory,
        byStatus,
    };
}
/**
 * 清空存储 (用于测试)
 */
export function clearAttributionStore() {
    hypothesisStore.clear();
    evidenceBundleStore.clear();
    attributionAnalysisStore.clear();
}
//# sourceMappingURL=store.js.map