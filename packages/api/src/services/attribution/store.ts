/**
 * 故障归因存储服务
 * Phase 1.3: 故障归因系统
 */

import type {
  AttributionStats,
  Hypothesis,
  HypothesisStatus,
  HypothesisCategory,
  CreateHypothesisRequest,
  EvidenceBundle,
  EvidenceItem,
  AttributionAnalysis,
} from '@los-ast/shared/types';
import { generateId } from '../../utils/id-generator.js';
import { attributionRepository } from '../../persistence/repositories/attribution-repository.js';
import { getAllIncidents } from '../incident/store.js';

const hypothesisStore = attributionRepository.hypotheses;
const evidenceBundleStore = attributionRepository.evidenceBundles;
const attributionAnalysisStore = attributionRepository.analyses;

/**
 * 创建假设
 */
export async function createHypothesis(request: CreateHypothesisRequest): Promise<Hypothesis> {
  const now = new Date().toISOString();
  const hypothesisId = generateId('hyp');

  const hypothesis: Hypothesis = {
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
    proposed_by: request.proposed_by || 'system',
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
export async function getHypothesis(hypothesisId: string): Promise<Hypothesis | null> {
  return hypothesisStore.get(hypothesisId) || null;
}

export async function getHypothesisWithScope(
  hypothesisId: string,
  scope?: {
    tenant_id?: string;
    project_id?: string;
  }
): Promise<Hypothesis | null> {
  const hypothesis = hypothesisStore.get(hypothesisId);
  if (!hypothesis) {
    return null;
  }

  const scopedIncidentIds = buildScopedIncidentIds(scope);
  return scopedIncidentIds.has(hypothesis.incident_id) ? hypothesis : null;
}

/**
 * 更新假设状态
 */
export async function updateHypothesisStatus(
  hypothesisId: string,
  newStatus: HypothesisStatus,
  confidence?: number,
  _actorId?: string,
  _reason?: string
): Promise<Hypothesis | null> {
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
export async function addEvidenceToHypothesis(
  hypothesisId: string,
  evidenceItem: EvidenceItem,
  isSupporting: boolean
): Promise<Hypothesis | null> {
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
  } else {
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
export async function queryHypotheses(params: {
  incident_id?: string;
  status?: HypothesisStatus;
  category?: string;
  limit?: number;
  offset?: number;
  scope?: {
    tenant_id?: string;
    project_id?: string;
  };
}): Promise<{ items: Hypothesis[]; total: number }> {
  const scopedIncidentIds = buildScopedIncidentIds(params.scope);
  let items = hypothesisStore.values().filter((hypothesis) =>
    scopedIncidentIds.has(hypothesis.incident_id)
  );

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
export async function createEvidenceBundle(
  incidentId: string,
  evidenceItems: EvidenceItem[]
): Promise<EvidenceBundle> {
  const bundleId = generateId('evd');

  const bundle: EvidenceBundle = {
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
export async function getEvidenceBundle(bundleId: string): Promise<EvidenceBundle | null> {
  return evidenceBundleStore.get(bundleId) || null;
}

export async function getEvidenceBundleWithScope(
  bundleId: string,
  scope?: {
    tenant_id?: string;
    project_id?: string;
  }
): Promise<EvidenceBundle | null> {
  const bundle = evidenceBundleStore.get(bundleId);
  if (!bundle) {
    return null;
  }

  const scopedIncidentIds = buildScopedIncidentIds(scope);
  return scopedIncidentIds.has(bundle.incident_id) ? bundle : null;
}

/**
 * 保存归因分析
 */
export async function saveAttributionAnalysis(analysis: AttributionAnalysis): Promise<void> {
  attributionAnalysisStore.set(analysis.analysis_id, analysis);
  console.log(`[AttributionStore] Saved attribution analysis ${analysis.analysis_id}`);
}

/**
 * 获取归因分析
 */
export async function getAttributionAnalysis(analysisId: string): Promise<AttributionAnalysis | null> {
  return attributionAnalysisStore.get(analysisId) || null;
}

function buildScopedIncidentIds(scope?: {
  tenant_id?: string;
  project_id?: string;
}): Set<string> {
  if (!scope?.tenant_id && !scope?.project_id) {
    return new Set(getAllIncidents().map((incident) => incident.incident_id));
  }

  return new Set(
    getAllIncidents()
      .filter((incident) => {
        if (scope.tenant_id && incident.scope.tenant_id !== scope.tenant_id) {
          return false;
        }
        if (scope.project_id && incident.scope.project_id !== scope.project_id) {
          return false;
        }
        return true;
      })
      .map((incident) => incident.incident_id)
  );
}

/**
 * 获取统计信息
 */
export function getAttributionStats(scope?: {
  tenant_id?: string;
  project_id?: string;
}): AttributionStats {
  const scopedIncidentIds = buildScopedIncidentIds(scope);
  const hypotheses = hypothesisStore.values().filter((hypothesis) =>
    scopedIncidentIds.has(hypothesis.incident_id)
  );
  const analyses = attributionAnalysisStore.values().filter((analysis) => {
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

  const byCategory: Record<HypothesisCategory, number> = {
    code_defect: 0,
    config_error: 0,
    infrastructure: 0,
    dependency_failure: 0,
  };
  const byStatus: Record<HypothesisStatus, number> = {
    proposed: 0,
    validating: 0,
    confirmed: 0,
    rejected: 0,
    superseded: 0,
  };
  let confidenceTotal = 0;
  let latencyTotal = 0;

  for (const h of hypotheses) {
    byCategory[h.category] += 1;
    byStatus[h.status] += 1;
    confidenceTotal += h.confidence;
  }

  for (const analysis of analyses) {
    latencyTotal += analysis.latency_ms;
  }

  return {
    total_analyses: analyses.length,
    hypotheses_by_category: byCategory,
    hypotheses_by_status: byStatus,
    average_confidence: hypotheses.length > 0 ? confidenceTotal / hypotheses.length : 0,
    average_latency_ms: analyses.length > 0 ? latencyTotal / analyses.length : 0,
  };
}

/**
 * 清空存储 (用于测试)
 */
export function clearAttributionStore(): void {
  hypothesisStore.clear();
  evidenceBundleStore.clear();
  attributionAnalysisStore.clear();
}
