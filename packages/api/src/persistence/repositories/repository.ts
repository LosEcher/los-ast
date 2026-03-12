import type { KeyValueStore } from '../key-value-store.js';
import { createKeyValueStore } from '../key-value-store.js';

export interface Repository<T> {
  get(id: string): T | undefined;
  has(id: string): boolean;
  set(id: string, value: T): void;
  delete(id: string): boolean;
  values(): T[];
  entries(): Array<[string, T]>;
  clear(): void;
  size(): number;
}

class KeyValueRepository<T> implements Repository<T> {
  constructor(private readonly store: KeyValueStore<T>) {}

  get(id: string): T | undefined {
    return this.store.get(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  set(id: string, value: T): void {
    this.store.set(id, value);
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  values(): T[] {
    return this.store.values();
  }

  entries(): Array<[string, T]> {
    return this.store.entries();
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size();
  }
}

export function createRepository<T>(name: string): Repository<T> {
  return new KeyValueRepository(createKeyValueStore<T>(name));
}
