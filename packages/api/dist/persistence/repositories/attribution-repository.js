import { createRepository } from './repository.js';
export const attributionRepository = {
    hypotheses: createRepository('experimental-attribution-hypotheses'),
    evidenceBundles: createRepository('experimental-attribution-evidence-bundles'),
    analyses: createRepository('experimental-attribution-analyses'),
};
