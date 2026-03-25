import type {
  Incident,
  IncidentListResponse,
  IncidentQueryParams,
  IncidentStatus,
} from '@los-ast/shared/types';

import { PERSISTENCE_CONFIG } from '../../config/index.js';
import { applySqliteMigrations, createSqliteDatabase } from '../sqlite-database.js';
import { createRepository, type Repository } from './repository.js';
import {
  buildIncidentScopedStats,
  buildIncidentStatusCounts,
  buildIncidentWhereClause,
  incidentMigrations,
  parseStoredIncident,
  queryIncidentItems,
} from './incident-repository/shared.js';

export interface IncidentRepository extends Repository<Incident> {
  query(params: IncidentQueryParams): IncidentListResponse;
  getScopedStats(scope?: {
    tenant_id?: string;
    project_id?: string;
  }): { count: number; byStatus: Record<string, number> };
}

class InMemoryIncidentRepository implements IncidentRepository {
  constructor(private readonly repository: Repository<Incident>) {}

  get(id: string): Incident | undefined {
    return this.repository.get(id);
  }

  has(id: string): boolean {
    return this.repository.has(id);
  }

  set(id: string, value: Incident): void {
    this.repository.set(id, value);
  }

  delete(id: string): boolean {
    return this.repository.delete(id);
  }

  values(): Incident[] {
    return this.repository.values();
  }

  entries(): Array<[string, Incident]> {
    return this.repository.entries();
  }

  clear(): void {
    this.repository.clear();
  }

  size(): number {
    return this.repository.size();
  }

  query(params: IncidentQueryParams): IncidentListResponse {
    return queryIncidentItems(this.repository.values(), params);
  }

  getScopedStats(scope: { tenant_id?: string; project_id?: string } = {}): {
    count: number;
    byStatus: Record<string, number>;
  } {
    return buildIncidentScopedStats(this.repository.values(), scope);
  }
}

class SqliteIncidentRepository implements IncidentRepository {
  private readonly database = createSqliteDatabase();

  constructor() {
    applySqliteMigrations(this.database, 'incidents', incidentMigrations);
  }

  get(id: string): Incident | undefined {
    const row = this.database
      .prepare('SELECT payload_json FROM incidents WHERE incident_id = ?')
      .get(id) as { payload_json: string } | undefined;
    return parseStoredIncident(row?.payload_json, id);
  }

  has(id: string): boolean {
    const row = this.database
      .prepare('SELECT COUNT(*) as count FROM incidents WHERE incident_id = ?')
      .get(id) as { count: number | bigint };
    return (typeof row.count === 'bigint' ? Number(row.count) : row.count) > 0;
  }

  set(id: string, value: Incident): void {
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
    `).run(
      id,
      value.scope.tenant_id,
      value.scope.project_id,
      value.status,
      value.severity,
      value.source.type,
      value.fingerprint,
      value.created_at,
      value.updated_at,
      JSON.stringify(value)
    );
  }

  delete(id: string): boolean {
    const result = this.database.prepare('DELETE FROM incidents WHERE incident_id = ?').run(id);
    return Number(result.changes ?? 0) > 0;
  }

  values(): Incident[] {
    const rows = this.database
      .prepare('SELECT incident_id, payload_json FROM incidents ORDER BY created_at DESC')
      .all() as Array<{ incident_id: string; payload_json: string }>;
    return rows
      .map((row) => parseStoredIncident(row.payload_json, row.incident_id))
      .filter((incident): incident is Incident => incident !== undefined);
  }

  entries(): Array<[string, Incident]> {
    const rows = this.database
      .prepare('SELECT incident_id, payload_json FROM incidents ORDER BY created_at DESC')
      .all() as Array<{ incident_id: string; payload_json: string }>;
    return rows.flatMap((row) => {
      const incident = parseStoredIncident(row.payload_json, row.incident_id);
      return incident ? [[row.incident_id, incident] as [string, Incident]] : [];
    });
  }

  clear(): void {
    this.database.prepare('DELETE FROM incidents').run();
  }

  size(): number {
    const row = this.database.prepare('SELECT COUNT(*) as count FROM incidents').get() as {
      count: number | bigint;
    };
    return typeof row.count === 'bigint' ? Number(row.count) : row.count;
  }

  query(params: IncidentQueryParams): IncidentListResponse {
    const { whereClause, values } = buildIncidentWhereClause(params);
    const offset = params.offset || 0;
    const limit = params.limit || 20;

    const totalRow = this.database
      .prepare(`SELECT COUNT(*) as count FROM incidents ${whereClause}`)
      .get(...values) as { count: number | bigint };
    const total = typeof totalRow.count === 'bigint' ? Number(totalRow.count) : totalRow.count;

    const rows = this.database
      .prepare(`
        SELECT incident_id, payload_json
        FROM incidents
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...values, limit, offset) as Array<{ incident_id: string; payload_json: string }>;

    const items = rows
      .map((row) => parseStoredIncident(row.payload_json, row.incident_id))
      .filter((incident): incident is Incident => incident !== undefined);

    return {
      items,
      total,
      has_more: offset + limit < total,
      next_offset: offset + limit < total ? offset + limit : undefined,
    };
  }

  getScopedStats(scope: { tenant_id?: string; project_id?: string } = {}): {
    count: number;
    byStatus: Record<string, number>;
  } {
    const conditions: string[] = [];
    const values: string[] = [];

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
      .all(...values) as Array<{ status: IncidentStatus; count: number | bigint }>;
    return buildIncidentStatusCounts(rows);
  }
}

function createIncidentRepository(): IncidentRepository {
  if (PERSISTENCE_CONFIG.experimentalStoreBackend === 'sqlite') {
    return new SqliteIncidentRepository();
  }

  return new InMemoryIncidentRepository(createRepository<Incident>('experimental-incidents'));
}

export const incidentRepository = createIncidentRepository();
