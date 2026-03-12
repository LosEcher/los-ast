import type {
  CorrectedFact,
  IncidentLesson,
  Proposal,
  RecoveryRecipe,
  RejectedHypothesis,
} from '@los-ast/shared/types';

import { createRepository } from './repository.js';

export const memoryRepository = {
  proposals: createRepository<Proposal>('experimental-memory-proposals'),
  facts: createRepository<CorrectedFact>('experimental-memory-facts'),
  rejections: createRepository<RejectedHypothesis>('experimental-memory-rejections'),
  lessons: createRepository<IncidentLesson>('experimental-memory-lessons'),
  recipes: createRepository<RecoveryRecipe>('experimental-memory-recipes'),
} as const;
