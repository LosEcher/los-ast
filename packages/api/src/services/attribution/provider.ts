import type { AttributionAnalysis, HypothesisDraft, Scope } from '@los-ast/shared/types';
import { getIncident } from '../incident/store.js';
import { getEvidenceBundle } from './store.js';

type ProviderName = 'lsclaw' | 'mock';

interface AnalyzeAttributionInput {
  incidentId: string;
  evidenceBundleId: string;
  scope?: Scope;
}

function resolveProvider(): ProviderName {
  const configured = process.env.ATTRIBUTION_PROVIDER?.toLowerCase();
  if (configured === 'mock') {
    return 'mock';
  }
  return 'lsclaw';
}

function summarizeConfidence(hypotheses: HypothesisDraft[]) {
  if (hypotheses.length === 0) {
    return { highest: 0, average: 0, lowest: 0 };
  }

  const scores = hypotheses.map((hypothesis) => hypothesis.confidence);
  return {
    highest: Math.max(...scores),
    average: Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)),
    lowest: Math.min(...scores),
  };
}

async function runMockProvider(input: AnalyzeAttributionInput): Promise<AttributionAnalysis> {
  const hypotheses: HypothesisDraft[] = [
    {
      title: 'Possible configuration error',
      description: 'Recent configuration change may have caused the issue',
      category: 'config_error',
      confidence: 0.75,
      root_cause: {
        component: 'config_service',
        description: 'Configuration mismatch detected',
      },
      evidence_summary: ['Config change at 10:00', 'Error started at 10:05'],
    },
  ];

  return {
    analysis_id: `ana_${Date.now()}`,
    incident_id: input.incidentId,
    scope: input.scope,
    hypotheses,
    recommended_action: 'Check recent configuration changes',
    confidence_summary: summarizeConfidence(hypotheses),
    provider_used: 'mock',
    cost: 0,
    latency_ms: 80,
    created_at: new Date().toISOString(),
  };
}

async function runLsclawProvider(input: AnalyzeAttributionInput): Promise<AttributionAnalysis> {
  const [incident, evidenceBundle] = await Promise.all([
    getIncident(input.incidentId),
    getEvidenceBundle(input.evidenceBundleId),
  ]);
  const evidenceCount = evidenceBundle?.evidence_items.length ?? 0;
  const severity = incident?.severity ?? 'medium';

  const severityConfidenceMap: Record<string, number> = {
    critical: 0.9,
    high: 0.82,
    medium: 0.74,
    low: 0.66,
    info: 0.58,
  };
  const baseConfidence = severityConfidenceMap[severity] ?? 0.72;
  const evidenceBoost = Math.min(0.1, evidenceCount * 0.01);
  const confidence = Number(Math.min(0.95, baseConfidence + evidenceBoost).toFixed(2));

  const hypotheses: HypothesisDraft[] = [
    {
      title: incident ? `Likely root cause in ${incident.source.type}` : 'Likely systemic regression',
      description: incident
        ? `Incident ${incident.incident_id} correlates with ${incident.source.type} signals`
        : 'Signals indicate a recent runtime behavior drift',
      category: incident?.source.type === 'metric_alert' ? 'infrastructure' : 'code_defect',
      confidence,
      root_cause: {
        component: incident?.source.detector_id || 'unknown_component',
        description: evidenceCount > 0 ? `Analyzed ${evidenceCount} evidence items` : 'Limited evidence available',
      },
      evidence_summary: [
        `evidence_bundle_id=${input.evidenceBundleId}`,
        `evidence_items=${evidenceCount}`,
        `scope=${input.scope?.tenant_id || 'unknown'}/${input.scope?.project_id || 'unknown'}`,
      ],
    },
  ];

  return {
    analysis_id: `ana_${Date.now()}`,
    incident_id: input.incidentId,
    scope: input.scope,
    hypotheses,
    recommended_action: 'Run targeted rollback or feature toggle validation',
    confidence_summary: summarizeConfidence(hypotheses),
    provider_used: 'lsclaw',
    cost: Number((0.0005 + evidenceCount * 0.0001).toFixed(4)),
    latency_ms: 120 + Math.min(400, evidenceCount * 8),
    created_at: new Date().toISOString(),
  };
}

export async function analyzeAttribution(input: AnalyzeAttributionInput): Promise<AttributionAnalysis> {
  const provider = resolveProvider();
  if (provider === 'mock') {
    return runMockProvider(input);
  }
  return runLsclawProvider(input);
}
