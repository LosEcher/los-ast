import type { CodeEvidenceBundle } from '@los-ast/shared/types';
import { evidenceRepository } from '../../persistence/repositories/evidence-repository.js';

export function saveEvidenceBundle(bundle: CodeEvidenceBundle): void {
  evidenceRepository.set(bundle.bundle_id, bundle);
}

export function getStoredEvidenceBundle(bundleId: string): CodeEvidenceBundle | null {
  return evidenceRepository.get(bundleId) || null;
}

export function clearEvidenceStore(): void {
  evidenceRepository.clear();
}
