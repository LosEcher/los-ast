import type { CodeEvidenceBundle } from '@los-ast/shared/types';

import { createRepository } from './repository.js';

export const evidenceRepository = createRepository<CodeEvidenceBundle>('experimental-evidence-bundles');
