import type { ConfigBundle } from '@los-ast/shared/types';

import { createRepository } from './repository.js';

export const hotReloadRepository = createRepository<ConfigBundle>('experimental-hotreload-bundles');
