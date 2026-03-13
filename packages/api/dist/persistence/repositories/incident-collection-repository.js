import { createRepository } from './repository.js';
export const incidentCollectionRepository = {
    metrics: createRepository('experimental-incident-metrics'),
    logs: createRepository('experimental-incident-logs'),
    triggers: createRepository('experimental-incident-triggers'),
    triggerCooldowns: createRepository('experimental-incident-trigger-cooldowns'),
};
