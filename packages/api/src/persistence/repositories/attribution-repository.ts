import type { AttributionAnalysis, EvidenceBundle, Hypothesis } from '@los-ast/shared/types';

import { createRepository } from './repository.js';

export const attributionRepository = {
  hypotheses: createRepository<Hypothesis>('experimental-attribution-hypotheses'),
  evidenceBundles: createRepository<EvidenceBundle>('experimental-attribution-evidence-bundles'),
  analyses: createRepository<AttributionAnalysis>('experimental-attribution-analyses'),
} as const;
