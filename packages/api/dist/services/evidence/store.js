import { evidenceRepository } from '../../persistence/repositories/evidence-repository.js';
export function saveEvidenceBundle(bundle) {
    evidenceRepository.set(bundle.bundle_id, bundle);
}
export function getStoredEvidenceBundle(bundleId) {
    return evidenceRepository.get(bundleId) || null;
}
export function clearEvidenceStore() {
    evidenceRepository.clear();
}
