// Config module for lsclaw sample

import * as fs from 'fs';
import * as path from 'path';

interface Config {
  port: number;
  host: string;
  logLevel: string;
}

export class ConfigManager {
  private configPath: string;
  private config: Config | null = null;

  constructor(configPath: string) {
    this.configPath = path.resolve(configPath);
  }

  async load(): Promise<void> {
    console.log(`Loading config from ${this.configPath}`);

    const content = fs.readFileSync(this.configPath, 'utf8');
    this.config = JSON.parse(content) as Config;
  }

  get(key: keyof Config): unknown {
    if (!this.config) {
      throw new Error('Config not loaded');
    }
    return this.config[key];
  }

  getAll(): Config {
    if (!this.config) {
      throw new Error('Config not loaded');
    }
    return { ...this.config };
  }

  // Intentional issue: unused method
  private validatePort(port: number): boolean {
    return port > 0 && port < 65536;
  }
}
