import { PERSISTENCE_CONFIG } from '../../config/index.js';
import { applySqliteMigrations, createSqliteDatabase } from '../sqlite-database.js';
import { createRepository } from './repository.js';
import { buildIncidentScopedStats, buildIncidentStatusCounts, buildIncidentWhereClause, incidentMigrations, parseStoredIncident, queryIncidentItems, } from './incident-repository/shared.js';
class InMemoryIncidentRepository {
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
        return queryIncidentItems(this.repository.values(), params);
    }
    getScopedStats(scope = {}) {
        return buildIncidentScopedStats(this.repository.values(), scope);
    }
}
class SqliteIncidentRepository {
    database = createSqliteDatabase();
    constructor() {
        applySqliteMigrations(this.database, 'incidents', incidentMigrations);
    }
    get(id) {
        const row = this.database
            .prepare('SELECT payload_json FROM incidents WHERE incident_id = ?')
            .get(id);
        return parseStoredIncident(row?.payload_json, id);
    }
    has(id) {
        const row = this.database
            .prepare('SELECT COUNT(*) as count FROM incidents WHERE incident_id = ?')
            .get(id);
        return (typeof row.count === 'bigint' ? Number(row.count) : row.count) > 0;
    }
    set(id, value) {
        this.database.prepare(`
      INSERT INTO incidents (
        incident_id,
        tenant_id,
        project_id,
        status,
        severity,
        source_type,
        fingerprint,
        created_at,
        updated_at,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(incident_id)
      DO UPDATE SET
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        status = excluded.status,
        severity = excluded.severity,
        source_type = excluded.source_type,
        fingerprint = excluded.fingerprint,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        payload_json = excluded.payload_json
    `).run(id, value.scope.tenant_id, value.scope.project_id, value.status, value.severity, value.source.type, value.fingerprint, value.created_at, value.updated_at, JSON.stringify(value));
    }
    delete(id) {
        const result = this.database.prepare('DELETE FROM incidents WHERE incident_id = ?').run(id);
        return Number(result.changes ?? 0) > 0;
    }
    values() {
        const rows = this.database
            .prepare('SELECT incident_id, payload_json FROM incidents ORDER BY created_at DESC')
            .all();
        return rows
            .map((row) => parseStoredIncident(row.payload_json, row.incident_id))
            .filter((incident) => incident !== undefined);
    }
    entries() {
        const rows = this.database
            .prepare('SELECT incident_id, payload_json FROM incidents ORDER BY created_at DESC')
            .all();
        return rows.flatMap((row) => {
            const incident = parseStoredIncident(row.payload_json, row.incident_id);
            return incident ? [[row.incident_id, incident]] : [];
        });
    }
    clear() {
        this.database.prepare('DELETE FROM incidents').run();
    }
    size() {
        const row = this.database.prepare('SELECT COUNT(*) as count FROM incidents').get();
        return typeof row.count === 'bigint' ? Number(row.count) : row.count;
    }
    query(params) {
        const { whereClause, values } = buildIncidentWhereClause(params);
        const offset = params.offset || 0;
        const limit = params.limit || 20;
        const totalRow = this.database
            .prepare(`SELECT COUNT(*) as count FROM incidents ${whereClause}`)
            .get(...values);
        const total = typeof totalRow.count === 'bigint' ? Number(totalRow.count) : totalRow.count;
        const rows = this.database
            .prepare(`
        SELECT incident_id, payload_json
        FROM incidents
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
            .all(...values, limit, offset);
        const items = rows
            .map((row) => parseStoredIncident(row.payload_json, row.incident_id))
            .filter((incident) => incident !== undefined);
        return {
            items,
            total,
            has_more: offset + limit < total,
            next_offset: offset + limit < total ? offset + limit : undefined,
        };
    }
    getScopedStats(scope = {}) {
        const conditions = [];
        const values = [];
        if (scope.tenant_id) {
            conditions.push('tenant_id = ?');
            values.push(scope.tenant_id);
        }
        if (scope.project_id) {
            conditions.push('project_id = ?');
            values.push(scope.project_id);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const rows = this.database
            .prepare(`
        SELECT status, COUNT(*) as count
        FROM incidents
        ${whereClause}
        GROUP BY status
      `)
            .all(...values);
        return buildIncidentStatusCounts(rows);
    }
}
function createIncidentRepository() {
    if (PERSISTENCE_CONFIG.experimentalStoreBackend === 'sqlite') {
        return new SqliteIncidentRepository();
    }
    return new InMemoryIncidentRepository(createRepository('experimental-incidents'));
}
export const incidentRepository = createIncidentRepository();
