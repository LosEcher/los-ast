import type {
  RecoveryAction,
  RecoveryPolicy,
  RecoveryStats,
} from '@los-ast/shared/types';
import type { DatabaseSync } from 'node:sqlite';

import { PERSISTENCE_CONFIG } from '../../config/index.js';
import { applySqliteMigrations, createSqliteDatabase } from '../sqlite-database.js';
import { createRepository, type Repository } from './repository.js';
import {
  buildRecoveryActionWhereClause,
  buildRecoveryStats,
  parseStoredRecoveryAction,
  parseStoredRecoveryPolicy,
  queryRecoveryActionItems,
  type RecoveryActionQueryParams,
  type RecoveryActionQueryResult,
} from './recovery-repository/shared.js';

const recoveryActionMigrations = [
  {
    version: 1,
    up(database: DatabaseSync) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS recovery_actions (
          action_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          incident_id TEXT NOT NULL,
          hypothesis_id TEXT NOT NULL,
          status TEXT NOT NULL,
          level TEXT NOT NULL,
          type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          payload_json TEXT NOT NULL
        ) STRICT
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS recovery_actions_scope_created_idx
        ON recovery_actions (tenant_id, project_id, created_at DESC)
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS recovery_actions_incident_idx
        ON recovery_actions (incident_id, created_at DESC)
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS recovery_actions_status_idx
        ON recovery_actions (tenant_id, project_id, status)
      `);
    },
  },
];

const recoveryPolicyMigrations = [
  {
    version: 1,
    up(database: DatabaseSync) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS recovery_policies (
          policy_id TEXT PRIMARY KEY,
          level TEXT NOT NULL,
          name TEXT NOT NULL,
          auto_execute INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          payload_json TEXT NOT NULL
        ) STRICT
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS recovery_policies_level_idx
        ON recovery_policies (level, updated_at DESC)
      `);
    },
  },
];

export interface RecoveryActionRepository extends Repository<RecoveryAction> {
  query(params: RecoveryActionQueryParams): RecoveryActionQueryResult;
  getStats(scope?: {
    tenant_id?: string;
    project_id?: string;
  }): RecoveryStats;
}

export interface RecoveryPolicyRepository extends Repository<RecoveryPolicy> {
  getByLevel(level: string): RecoveryPolicy | undefined;
}

export interface RecoveryRepositorySet {
  actions: RecoveryActionRepository;
  policies: RecoveryPolicyRepository;
  cooldowns: Repository<number>;
}

class InMemoryRecoveryActionRepository implements RecoveryActionRepository {
  constructor(private readonly repository: Repository<RecoveryAction>) {}

  get(id: string): RecoveryAction | undefined {
    return this.repository.get(id);
  }

  has(id: string): boolean {
    return this.repository.has(id);
  }

  set(id: string, value: RecoveryAction): void {
    this.repository.set(id, value);
  }

  delete(id: string): boolean {
    return this.repository.delete(id);
  }

  values(): RecoveryAction[] {
    return this.repository.values();
  }

  entries(): Array<[string, RecoveryAction]> {
    return this.repository.entries();
  }

  clear(): void {
    this.repository.clear();
  }

  size(): number {
    return this.repository.size();
  }

  query(params: RecoveryActionQueryParams): RecoveryActionQueryResult {
    return queryRecoveryActionItems(this.repository.values(), params);
  }

  getStats(scope?: { tenant_id?: string; project_id?: string }): RecoveryStats {
    return buildRecoveryStats(this.repository.values(), scope);
  }
}

class InMemoryRecoveryPolicyRepository implements RecoveryPolicyRepository {
  constructor(private readonly repository: Repository<RecoveryPolicy>) {}

  get(id: string): RecoveryPolicy | undefined {
    return this.repository.get(id);
  }

  has(id: string): boolean {
    return this.repository.has(id);
  }

  set(id: string, value: RecoveryPolicy): void {
    this.repository.set(id, value);
  }

  delete(id: string): boolean {
    return this.repository.delete(id);
  }

  values(): RecoveryPolicy[] {
    return this.repository.values();
  }

  entries(): Array<[string, RecoveryPolicy]> {
    return this.repository.entries();
  }

  clear(): void {
    this.repository.clear();
  }

  size(): number {
    return this.repository.size();
  }

  getByLevel(level: string): RecoveryPolicy | undefined {
    return this.repository.values().find((policy) => policy.level === level);
  }
}

class SqliteRecoveryActionRepository implements RecoveryActionRepository {
  private readonly database = createSqliteDatabase();

  constructor() {
    applySqliteMigrations(this.database, 'recovery_actions', recoveryActionMigrations);
  }

  get(id: string): RecoveryAction | undefined {
    const row = this.database
      .prepare('SELECT payload_json FROM recovery_actions WHERE action_id = ?')
      .get(id) as { payload_json: string } | undefined;
    return this.parseAction(row?.payload_json, id);
  }

  has(id: string): boolean {
    const row = this.database
      .prepare('SELECT COUNT(*) as count FROM recovery_actions WHERE action_id = ?')
      .get(id) as { count: number | bigint };
    const count = typeof row.count === 'bigint' ? Number(row.count) : row.count;
    return count > 0;
  }

  set(id: string, value: RecoveryAction): void {
    this.database.prepare(`
      INSERT INTO recovery_actions (
        action_id,
        tenant_id,
        project_id,
        incident_id,
        hypothesis_id,
        status,
        level,
        type,
        created_at,
        updated_at,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(action_id)
      DO UPDATE SET
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        incident_id = excluded.incident_id,
        hypothesis_id = excluded.hypothesis_id,
        status = excluded.status,
        level = excluded.level,
        type = excluded.type,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        payload_json = excluded.payload_json
    `).run(
      id,
      value.scope.tenant_id,
      value.scope.project_id,
      value.incident_id,
      value.hypothesis_id,
      value.status,
      value.level,
      value.type,
      value.created_at,
      value.updated_at,
      JSON.stringify(value)
    );
  }

  delete(id: string): boolean {
    const result = this.database.prepare('DELETE FROM recovery_actions WHERE action_id = ?').run(id);
    return Number(result.changes ?? 0) > 0;
  }

  values(): RecoveryAction[] {
    const rows = this.database
      .prepare('SELECT action_id, payload_json FROM recovery_actions ORDER BY created_at DESC')
      .all() as Array<{ action_id: string; payload_json: string }>;
    return rows
      .map((row) => this.parseAction(row.payload_json, row.action_id))
      .filter((action): action is RecoveryAction => action !== undefined);
  }

  entries(): Array<[string, RecoveryAction]> {
    const rows = this.database
      .prepare('SELECT action_id, payload_json FROM recovery_actions ORDER BY created_at DESC')
      .all() as Array<{ action_id: string; payload_json: string }>;
    return rows.flatMap((row) => {
      const action = this.parseAction(row.payload_json, row.action_id);
      return action ? [[row.action_id, action] as [string, RecoveryAction]] : [];
    });
  }

  clear(): void {
    this.database.prepare('DELETE FROM recovery_actions').run();
  }

  size(): number {
    const row = this.database.prepare('SELECT COUNT(*) as count FROM recovery_actions').get() as {
      count: number | bigint;
    };
    return typeof row.count === 'bigint' ? Number(row.count) : row.count;
  }

  query(params: RecoveryActionQueryParams): RecoveryActionQueryResult {
    const { whereClause, values } = buildRecoveryActionWhereClause(params);
    const offset = params.offset || 0;
    const limit = params.limit || 20;

    const totalRow = this.database
      .prepare(`SELECT COUNT(*) as count FROM recovery_actions ${whereClause}`)
      .get(...values) as { count: number | bigint };
    const total = typeof totalRow.count === 'bigint' ? Number(totalRow.count) : totalRow.count;

    const rows = this.database
      .prepare(`
        SELECT action_id, payload_json
        FROM recovery_actions
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...values, limit, offset) as Array<{ action_id: string; payload_json: string }>;

    return {
      items: rows
        .map((row) => this.parseAction(row.payload_json, row.action_id))
        .filter((action): action is RecoveryAction => action !== undefined),
      total,
    };
  }

  getStats(scope?: { tenant_id?: string; project_id?: string }): RecoveryStats {
    const conditions: string[] = [];
    const values: string[] = [];

    if (scope?.tenant_id) {
      conditions.push('tenant_id = ?');
      values.push(scope.tenant_id);
    }

    if (scope?.project_id) {
      conditions.push('project_id = ?');
      values.push(scope.project_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.database
      .prepare(`
        SELECT action_id, payload_json
        FROM recovery_actions
        ${whereClause}
      `)
      .all(...values) as Array<{ action_id: string; payload_json: string }>;

    const actions = rows
      .map((row) => this.parseAction(row.payload_json, row.action_id))
      .filter((action): action is RecoveryAction => action !== undefined);

    return buildRecoveryStats(actions);
  }

  private parseAction(rawValue: string | undefined, actionId: string): RecoveryAction | undefined {
    return parseStoredRecoveryAction(rawValue, actionId);
  }
}

class SqliteRecoveryPolicyRepository implements RecoveryPolicyRepository {
  private readonly database = createSqliteDatabase();

  constructor() {
    applySqliteMigrations(this.database, 'recovery_policies', recoveryPolicyMigrations);
  }

  get(id: string): RecoveryPolicy | undefined {
    const row = this.database
      .prepare('SELECT payload_json FROM recovery_policies WHERE policy_id = ?')
      .get(id) as { payload_json: string } | undefined;
    return this.parsePolicy(row?.payload_json, id);
  }

  has(id: string): boolean {
    const row = this.database
      .prepare('SELECT COUNT(*) as count FROM recovery_policies WHERE policy_id = ?')
      .get(id) as { count: number | bigint };
    const count = typeof row.count === 'bigint' ? Number(row.count) : row.count;
    return count > 0;
  }

  set(id: string, value: RecoveryPolicy): void {
    this.database.prepare(`
      INSERT INTO recovery_policies (
        policy_id,
        level,
        name,
        auto_execute,
        created_at,
        updated_at,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(policy_id)
      DO UPDATE SET
        level = excluded.level,
        name = excluded.name,
        auto_execute = excluded.auto_execute,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        payload_json = excluded.payload_json
    `).run(
      id,
      value.level,
      value.name,
      value.auto_execute ? 1 : 0,
      value.created_at,
      value.updated_at,
      JSON.stringify(value)
    );
  }

  delete(id: string): boolean {
    const result = this.database.prepare('DELETE FROM recovery_policies WHERE policy_id = ?').run(id);
    return Number(result.changes ?? 0) > 0;
  }

  values(): RecoveryPolicy[] {
    const rows = this.database
      .prepare('SELECT policy_id, payload_json FROM recovery_policies ORDER BY updated_at DESC')
      .all() as Array<{ policy_id: string; payload_json: string }>;
    return rows
      .map((row) => this.parsePolicy(row.payload_json, row.policy_id))
      .filter((policy): policy is RecoveryPolicy => policy !== undefined);
  }

  entries(): Array<[string, RecoveryPolicy]> {
    const rows = this.database
      .prepare('SELECT policy_id, payload_json FROM recovery_policies ORDER BY updated_at DESC')
      .all() as Array<{ policy_id: string; payload_json: string }>;
    return rows.flatMap((row) => {
      const policy = this.parsePolicy(row.payload_json, row.policy_id);
      return policy ? [[row.policy_id, policy] as [string, RecoveryPolicy]] : [];
    });
  }

  clear(): void {
    this.database.prepare('DELETE FROM recovery_policies').run();
  }

  size(): number {
    const row = this.database.prepare('SELECT COUNT(*) as count FROM recovery_policies').get() as {
      count: number | bigint;
    };
    return typeof row.count === 'bigint' ? Number(row.count) : row.count;
  }

  getByLevel(level: string): RecoveryPolicy | undefined {
    const row = this.database
      .prepare(`
        SELECT policy_id, payload_json
        FROM recovery_policies
        WHERE level = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `)
      .get(level) as { policy_id: string; payload_json: string } | undefined;
    return this.parsePolicy(row?.payload_json, row?.policy_id ?? level);
  }

  private parsePolicy(rawValue: string | undefined, policyId: string): RecoveryPolicy | undefined {
    return parseStoredRecoveryPolicy(rawValue, policyId);
  }
}

function createRecoveryRepository(): RecoveryRepositorySet {
  if (PERSISTENCE_CONFIG.experimentalStoreBackend === 'sqlite') {
    return {
      actions: new SqliteRecoveryActionRepository(),
      policies: new SqliteRecoveryPolicyRepository(),
      cooldowns: createRepository<number>('experimental-recovery-cooldowns'),
    };
  }

  return {
    actions: new InMemoryRecoveryActionRepository(createRepository<RecoveryAction>('experimental-recovery-actions')),
    policies: new InMemoryRecoveryPolicyRepository(createRepository<RecoveryPolicy>('experimental-recovery-policies')),
    cooldowns: createRepository<number>('experimental-recovery-cooldowns'),
  };
}

export const recoveryRepository = createRecoveryRepository();
