import type { LogEntry, MetricDataPoint, Trigger } from '@los-ast/shared/types';

import { createRepository } from './repository.js';

export const incidentCollectionRepository = {
  metrics: createRepository<MetricDataPoint[]>('experimental-incident-metrics'),
  logs: createRepository<LogEntry[]>('experimental-incident-logs'),
  triggers: createRepository<Trigger>('experimental-incident-triggers'),
  triggerCooldowns: createRepository<number>('experimental-incident-trigger-cooldowns'),
} as const;
