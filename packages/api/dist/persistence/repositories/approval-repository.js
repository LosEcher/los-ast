import { PERSISTENCE_CONFIG } from '../../config/index.js';
import { applySqliteMigrations, createSqliteDatabase } from '../sqlite-database.js';
import { createRepository } from './repository.js';
import { buildApprovalStats, buildApprovalWhereClause, listExpiredPendingApprovalEntries, parseStoredApproval, queryApprovalItems, } from './approval-repository/shared.js';
const approvalMigrations = [
    {
        version: 1,
        up(database) {
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
class InMemoryApprovalRepository {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    get(id) {
        return this.repository.get(id);
    }
    has(id) {
        return this.repository.has(id);
    }
    set(id, value) {
        this.repository.set(id, value);
    }
    delete(id) {
        return this.repository.delete(id);
    }
    values() {
        return this.repository.values();
    }
    entries() {
        return this.repository.entries();
    }
    clear() {
        this.repository.clear();
    }
    size() {
        return this.repository.size();
    }
    query(params) {
        return queryApprovalItems(this.repository.values(), params);
    }
    getStats(tenant_id, project_id) {
        return buildApprovalStats(this.repository.values(), tenant_id, project_id);
    }
    listPendingExpired(referenceTime) {
        return listExpiredPendingApprovalEntries(this.repository.entries(), referenceTime);
    }
}
class SqliteApprovalRepository {
    database = createSqliteDatabase();
    constructor() {
        applySqliteMigrations(this.database, 'approvals', approvalMigrations);
    }
    get(id) {
        const row = this.database
            .prepare('SELECT payload_json FROM approvals WHERE approval_id = ?')
            .get(id);
        return this.parseApproval(row?.payload_json, id);
    }
    has(id) {
        const row = this.database
            .prepare('SELECT COUNT(*) as count FROM approvals WHERE approval_id = ?')
            .get(id);
        const count = typeof row.count === 'bigint' ? Number(row.count) : row.count;
        return count > 0;
    }
    set(id, value) {
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
    `).run(id, value.scope.tenant_id, value.scope.project_id, value.status, value.risk_level, value.item_type, value.timeout_at, value.created_at, value.updated_at, JSON.stringify(value));
    }
    delete(id) {
        const result = this.database.prepare('DELETE FROM approvals WHERE approval_id = ?').run(id);
        return Number(result.changes ?? 0) > 0;
    }
    values() {
        const rows = this.database
            .prepare('SELECT approval_id, payload_json FROM approvals ORDER BY created_at DESC')
            .all();
        return rows
            .map((row) => this.parseApproval(row.payload_json, row.approval_id))
            .filter((approval) => approval !== undefined);
    }
    entries() {
        const rows = this.database
            .prepare('SELECT approval_id, payload_json FROM approvals ORDER BY created_at DESC')
            .all();
        return rows.flatMap((row) => {
            const approval = this.parseApproval(row.payload_json, row.approval_id);
            return approval ? [[row.approval_id, approval]] : [];
        });
    }
    clear() {
        this.database.prepare('DELETE FROM approvals').run();
    }
    size() {
        const row = this.database.prepare('SELECT COUNT(*) as count FROM approvals').get();
        return typeof row.count === 'bigint' ? Number(row.count) : row.count;
    }
    query(params) {
        const { whereClause, values } = buildApprovalWhereClause(params);
        const offset = params.offset || 0;
        const limit = params.limit || 20;
        const totalRow = this.database
            .prepare(`SELECT COUNT(*) as count FROM approvals ${whereClause}`)
            .get(...values);
        const total = typeof totalRow.count === 'bigint' ? Number(totalRow.count) : totalRow.count;
        const rows = this.database
            .prepare(`
        SELECT approval_id, payload_json
        FROM approvals
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
            .all(...values, limit, offset);
        const items = rows
            .map((row) => this.parseApproval(row.payload_json, row.approval_id))
            .filter((approval) => approval !== undefined);
        return {
            items,
            total,
            has_more: offset + limit < total,
            next_offset: offset + limit < total ? offset + limit : undefined,
        };
    }
    getStats(tenant_id, project_id) {
        const rows = this.database
            .prepare(`
        SELECT payload_json
        FROM approvals
        WHERE tenant_id = ? AND project_id = ?
      `)
            .all(tenant_id, project_id);
        return buildApprovalStats(rows
            .map((row) => this.parseApproval(row.payload_json, 'stats-row'))
            .filter((approval) => approval !== undefined), tenant_id, project_id);
    }
    listPendingExpired(referenceTime) {
        const rows = this.database
            .prepare(`
        SELECT approval_id, payload_json
        FROM approvals
        WHERE status = 'pending' AND timeout_at < ?
        ORDER BY timeout_at ASC
      `)
            .all(referenceTime);
        return rows.flatMap((row) => {
            const approval = this.parseApproval(row.payload_json, row.approval_id);
            return approval ? [[row.approval_id, approval]] : [];
        });
    }
    parseApproval(rawValue, approvalId) {
        return parseStoredApproval(rawValue, approvalId);
    }
}
function createApprovalRepository() {
    if (PERSISTENCE_CONFIG.experimentalStoreBackend === 'sqlite') {
        return new SqliteApprovalRepository();
    }
    return new InMemoryApprovalRepository(createRepository('experimental-approvals'));
}
export const approvalRepository = createApprovalRepository();
