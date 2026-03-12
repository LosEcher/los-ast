import type {
  Incident,
  IncidentListResponse,
  IncidentQueryParams,
  IncidentStatus,
} from '@los-ast/shared/types';

import { PERSISTENCE_CONFIG } from '../../config/index.js';
import { createSqliteDatabase, registerSqliteSchemaVersion } from '../sqlite-database.js';
import { createRepository, type Repository } from './repository.js';

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
    let items = this.repository.values();

    if (params.tenant_id) {
      items = items.filter((incident) => incident.scope.tenant_id === params.tenant_id);
    }

    if (params.project_id) {
      items = items.filter((incident) => incident.scope.project_id === params.project_id);
    }

    if (params.status) {
      items = items.filter((incident) => incident.status === params.status);
    }

    if (params.severity) {
      items = items.filter((incident) => incident.severity === params.severity);
    }

    if (params.source_type) {
      items = items.filter((incident) => incident.source.type === params.source_type);
    }

    if (params.from) {
      const from = params.from;
      items = items.filter((incident) => incident.created_at >= from);
    }

    if (params.to) {
      const to = params.to;
      items = items.filter((incident) => incident.created_at <= to);
    }

    items.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

    const total = items.length;
    const offset = params.offset || 0;
    const limit = params.limit || 20;

    items = items.slice(offset, offset + limit);

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
    const items = this.repository.values().filter((incident) => {
      if (scope.tenant_id && incident.scope.tenant_id !== scope.tenant_id) {
        return false;
      }

      if (scope.project_id && incident.scope.project_id !== scope.project_id) {
        return false;
      }

      return true;
    });
    const byStatus: Record<string, number> = {};

    for (const incident of items) {
      byStatus[incident.status] = (byStatus[incident.status] || 0) + 1;
    }

    return {
      count: items.length,
      byStatus,
    };
  }
}

class SqliteIncidentRepository implements IncidentRepository {
  private readonly database = createSqliteDatabase();

  constructor() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS incidents (
        incident_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        severity TEXT NOT NULL,
        source_type TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT
    `);
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS incidents_scope_created_idx
      ON incidents (tenant_id, project_id, created_at DESC)
    `);
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS incidents_scope_status_idx
      ON incidents (tenant_id, project_id, status)
    `);
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS incidents_scope_severity_idx
      ON incidents (tenant_id, project_id, severity)
    `);
    registerSqliteSchemaVersion(this.database, 'incidents', 1);
  }

  get(id: string): Incident | undefined {
    const row = this.database
      .prepare('SELECT payload_json FROM incidents WHERE incident_id = ?')
      .get(id) as { payload_json: string } | undefined;
    return this.parseIncident(row?.payload_json, id);
  }

  has(id: string): boolean {
    const row = this.database
      .prepare('SELECT COUNT(*) as count FROM incidents WHERE incident_id = ?')
      .get(id) as { count: number | bigint };
    const count = typeof row.count === 'bigint' ? Number(row.count) : row.count;
    return count > 0;
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
      .map((row) => this.parseIncident(row.payload_json, row.incident_id))
      .filter((incident): incident is Incident => incident !== undefined);
  }

  entries(): Array<[string, Incident]> {
    const rows = this.database
      .prepare('SELECT incident_id, payload_json FROM incidents ORDER BY created_at DESC')
      .all() as Array<{ incident_id: string; payload_json: string }>;
    return rows.flatMap((row) => {
      const incident = this.parseIncident(row.payload_json, row.incident_id);
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
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (params.tenant_id) {
      conditions.push('tenant_id = ?');
      values.push(params.tenant_id);
    }

    if (params.project_id) {
      conditions.push('project_id = ?');
      values.push(params.project_id);
    }

    if (params.status) {
      conditions.push('status = ?');
      values.push(params.status);
    }

    if (params.severity) {
      conditions.push('severity = ?');
      values.push(params.severity);
    }

    if (params.source_type) {
      conditions.push('source_type = ?');
      values.push(params.source_type);
    }

    if (params.from) {
      conditions.push('created_at >= ?');
      values.push(params.from);
    }

    if (params.to) {
      conditions.push('created_at <= ?');
      values.push(params.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
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
      .map((row) => this.parseIncident(row.payload_json, row.incident_id))
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

    const byStatus: Record<string, number> = {};
    let count = 0;

    for (const row of rows) {
      const statusCount = typeof row.count === 'bigint' ? Number(row.count) : row.count;
      byStatus[row.status] = statusCount;
      count += statusCount;
    }

    return {
      count,
      byStatus,
    };
  }

  private parseIncident(rawValue: string | undefined, incidentId: string): Incident | undefined {
    if (!rawValue) {
      return undefined;
    }

    try {
      return JSON.parse(rawValue) as Incident;
    } catch (error) {
      console.warn(
        `[Persistence] Ignoring invalid incident payload for "${incidentId}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return undefined;
    }
  }
}

function createIncidentRepository(): IncidentRepository {
  if (PERSISTENCE_CONFIG.experimentalStoreBackend === 'sqlite') {
    return new SqliteIncidentRepository();
  }

  return new InMemoryIncidentRepository(createRepository<Incident>('experimental-incidents'));
}

export const incidentRepository = createIncidentRepository();
