// Router module for lsclaw sample

import type { ConfigManager } from './config';

export class Router {
  private config: ConfigManager;
  private routes: Map<string, Function> = new Map();

  constructor(config: ConfigManager) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log('Initializing router...');
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.routes.set('/health', () => ({ status: 'ok' }));
    this.routes.set('/config', () => this.config.getAll());
  }

  async cleanup(): Promise<void> {
    console.log('Cleaning up router...');
    this.routes.clear();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async route(path: string, _data: unknown): Promise<unknown> {
    const handler = this.routes.get(path);
    if (!handler) {
      throw new Error(`Route not found: ${path}`);
    }
    return handler();
  }
}
