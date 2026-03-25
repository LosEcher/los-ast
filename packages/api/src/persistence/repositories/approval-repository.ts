import type {
  ApprovalItem,
  ApprovalQueryParams,
  ApprovalStats,
} from '@los-ast/shared/types';
import type { DatabaseSync } from 'node:sqlite';

import { PERSISTENCE_CONFIG } from '../../config/index.js';
import { applySqliteMigrations, createSqliteDatabase } from '../sqlite-database.js';
import { createRepository, type Repository } from './repository.js';
import {
  buildApprovalStats,
  buildApprovalWhereClause,
  listExpiredPendingApprovalEntries,
  parseStoredApproval,
  queryApprovalItems,
  type ApprovalQueryResult,
} from './approval-repository/shared.js';

const approvalMigrations = [
  {
    version: 1,
    up(database: DatabaseSync) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS approvals (
          approval_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          status TEXT NOT NULL,
          risk_level TEXT NOT NULL,
          item_type TEXT NOT NULL,
          timeout_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          payload_json TEXT NOT NULL
        ) STRICT
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS approvals_scope_created_idx
        ON approvals (tenant_id, project_id, created_at DESC)
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS approvals_scope_status_idx
        ON approvals (tenant_id, project_id, status)
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS approvals_scope_timeout_idx
        ON approvals (status, timeout_at)
      `);
    },
  },
];

export interface ApprovalRepository extends Repository<ApprovalItem> {
  query(params: ApprovalQueryParams): ApprovalQueryResult;
  getStats(tenant_id: string, project_id: string): ApprovalStats;
  listPendingExpired(referenceTime: string): Array<[string, ApprovalItem]>;
}

class InMemoryApprovalRepository implements ApprovalRepository {
  constructor(private readonly repository: Repository<ApprovalItem>) {}

  get(id: string): ApprovalItem | undefined {
    return this.repository.get(id);
  }

  has(id: string): boolean {
    return this.repository.has(id);
  }

  set(id: string, value: ApprovalItem): void {
    this.repository.set(id, value);
  }

  delete(id: string): boolean {
    return this.repository.delete(id);
  }

  values(): ApprovalItem[] {
    return this.repository.values();
  }

  entries(): Array<[string, ApprovalItem]> {
    return this.repository.entries();
  }

  clear(): void {
    this.repository.clear();
  }

  size(): number {
    return this.repository.size();
  }

  query(params: ApprovalQueryParams): ApprovalQueryResult {
    return queryApprovalItems(this.repository.values(), params);
  }

  getStats(tenant_id: string, project_id: string): ApprovalStats {
    return buildApprovalStats(this.repository.values(), tenant_id, project_id);
  }

  listPendingExpired(referenceTime: string): Array<[string, ApprovalItem]> {
    return listExpiredPendingApprovalEntries(this.repository.entries(), referenceTime);
  }
}

class SqliteApprovalRepository implements ApprovalRepository {
  private readonly database = createSqliteDatabase();

  constructor() {
    applySqliteMigrations(this.database, 'approvals', approvalMigrations);
  }

  get(id: string): ApprovalItem | undefined {
    const row = this.database
      .prepare('SELECT payload_json FROM approvals WHERE approval_id = ?')
      .get(id) as { payload_json: string } | undefined;
    return this.parseApproval(row?.payload_json, id);
  }

  has(id: string): boolean {
    const row = this.database
      .prepare('SELECT COUNT(*) as count FROM approvals WHERE approval_id = ?')
      .get(id) as { count: number | bigint };
    const count = typeof row.count === 'bigint' ? Number(row.count) : row.count;
    return count > 0;
  }

  set(id: string, value: ApprovalItem): void {
    this.database.prepare(`
      INSERT INTO approvals (
        approval_id,
        tenant_id,
        project_id,
        status,
        risk_level,
        item_type,
        timeout_at,
        created_at,
        updated_at,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(approval_id)
      DO UPDATE SET
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        status = excluded.status,
        risk_level = excluded.risk_level,
        item_type = excluded.item_type,
        timeout_at = excluded.timeout_at,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        payload_json = excluded.payload_json
    `).run(
      id,
      value.scope.tenant_id,
      value.scope.project_id,
      value.status,
      value.risk_level,
      value.item_type,
      value.timeout_at,
      value.created_at,
      value.updated_at,
      JSON.stringify(value)
    );
  }

  delete(id: string): boolean {
    const result = this.database.prepare('DELETE FROM approvals WHERE approval_id = ?').run(id);
    return Number(result.changes ?? 0) > 0;
  }

  values(): ApprovalItem[] {
    const rows = this.database
      .prepare('SELECT approval_id, payload_json FROM approvals ORDER BY created_at DESC')
      .all() as Array<{ approval_id: string; payload_json: string }>;
    return rows
      .map((row) => this.parseApproval(row.payload_json, row.approval_id))
      .filter((approval): approval is ApprovalItem => approval !== undefined);
  }

  entries(): Array<[string, ApprovalItem]> {
    const rows = this.database
      .prepare('SELECT approval_id, payload_json FROM approvals ORDER BY created_at DESC')
      .all() as Array<{ approval_id: string; payload_json: string }>;
    return rows.flatMap((row) => {
      const approval = this.parseApproval(row.payload_json, row.approval_id);
      return approval ? [[row.approval_id, approval] as [string, ApprovalItem]] : [];
    });
  }

  clear(): void {
    this.database.prepare('DELETE FROM approvals').run();
  }

  size(): number {
    const row = this.database.prepare('SELECT COUNT(*) as count FROM approvals').get() as {
      count: number | bigint;
    };
    return typeof row.count === 'bigint' ? Number(row.count) : row.count;
  }

  query(params: ApprovalQueryParams): ApprovalQueryResult {
    const { whereClause, values } = buildApprovalWhereClause(params);
    const offset = params.offset || 0;
    const limit = params.limit || 20;

    const totalRow = this.database
      .prepare(`SELECT COUNT(*) as count FROM approvals ${whereClause}`)
      .get(...values) as { count: number | bigint };
    const total = typeof totalRow.count === 'bigint' ? Number(totalRow.count) : totalRow.count;

    const rows = this.database
      .prepare(`
        SELECT approval_id, payload_json
        FROM approvals
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...values, limit, offset) as Array<{ approval_id: string; payload_json: string }>;

    const items = rows
      .map((row) => this.parseApproval(row.payload_json, row.approval_id))
      .filter((approval): approval is ApprovalItem => approval !== undefined);

    return {
      items,
      total,
      has_more: offset + limit < total,
      next_offset: offset + limit < total ? offset + limit : undefined,
    };
  }

  getStats(tenant_id: string, project_id: string): ApprovalStats {
    const rows = this.database
      .prepare(`
        SELECT payload_json
        FROM approvals
        WHERE tenant_id = ? AND project_id = ?
      `)
      .all(tenant_id, project_id) as Array<{ payload_json: string }>;

    return buildApprovalStats(
      rows
        .map((row) => this.parseApproval(row.payload_json, 'stats-row'))
        .filter((approval): approval is ApprovalItem => approval !== undefined),
      tenant_id,
      project_id
    );
  }

  listPendingExpired(referenceTime: string): Array<[string, ApprovalItem]> {
    const rows = this.database
      .prepare(`
        SELECT approval_id, payload_json
        FROM approvals
        WHERE status = 'pending' AND timeout_at < ?
        ORDER BY timeout_at ASC
      `)
      .all(referenceTime) as Array<{ approval_id: string; payload_json: string }>;

    return rows.flatMap((row) => {
      const approval = this.parseApproval(row.payload_json, row.approval_id);
      return approval ? [[row.approval_id, approval] as [string, ApprovalItem]] : [];
    });
  }

  private parseApproval(rawValue: string | undefined, approvalId: string): ApprovalItem | undefined {
    return parseStoredApproval(rawValue, approvalId);
  }
}

function createApprovalRepository(): ApprovalRepository {
  if (PERSISTENCE_CONFIG.experimentalStoreBackend === 'sqlite') {
    return new SqliteApprovalRepository();
  }

  return new InMemoryApprovalRepository(createRepository<ApprovalItem>('experimental-approvals'));
}

export const approvalRepository = createApprovalRepository();
