import type { RecoveryAction, RecoveryPolicy } from '@los-ast/shared/types';

import { createRepository } from './repository.js';

export const recoveryRepository = {
  actions: createRepository<RecoveryAction>('experimental-recovery-actions'),
  policies: createRepository<RecoveryPolicy>('experimental-recovery-policies'),
  cooldowns: createRepository<number>('experimental-recovery-cooldowns'),
} as const;
