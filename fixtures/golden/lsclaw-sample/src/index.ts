// LSClaw Sample - Medium TypeScript project for los-ast validation

import { Router } from './router';
import { ConfigManager } from './config';

class LSClaw {
  private router: Router;
  private config: ConfigManager;

  constructor(configPath: string) {
    this.config = new ConfigManager(configPath);
    this.router = new Router(this.config);
  }

  async start(): Promise<void> {
    console.log('Starting LSClaw server...');
    await this.router.initialize();
    console.log('LSClaw server started');
  }

  async stop(): Promise<void> {
    console.log('Stopping LSClaw server...');
    await this.router.cleanup();
  }
}

// Main entry point
async function main() {
  const app = new LSClaw('./config.yaml');

  try {
    await app.start();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await app.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

main();

// Intentional issues for testing:
// 1. console.log usage
// 2. console.error usage
