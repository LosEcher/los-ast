import { describe, expect, it } from 'vitest';
import {
  inferFormat,
  parsePrismaEntities,
  parseSqlEntities,
} from '../../../src/services/schema-artifacts/shared.js';

describe('schema artifacts shared helpers', () => {
  it('infers schema formats from content', () => {
    expect(inferFormat({ content: 'model User {\n  id String @id\n}\n' })).toBe('prisma');
    expect(inferFormat({ content: 'CREATE TABLE users (\n  id uuid primary key\n);\n' })).toBe('sql');
  });

  it('normalizes equivalent SQL defaults and composite primary keys', () => {
    const [entity] = parseSqlEntities([
      'CREATE TABLE users (',
      '  id uuid DEFAULT uuid_generate_v4(),',
      '  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,',
      '  email text UNIQUE,',
      '  PRIMARY KEY (id)',
      ');',
    ].join('\n'));

    expect(entity.name).toBe('users');
    expect(entity.fields.get('id')).toMatchObject({
      defaultValue: '@generated_uuid',
      primaryKey: true,
    });
    expect(entity.fields.get('created_at')).toMatchObject({
      defaultValue: '@current_timestamp',
      hasDefault: true,
    });
    expect(entity.fields.get('email')?.unique).toBe(true);
  });

  it('normalizes common SQL type synonyms conservatively', () => {
    const [entity] = parseSqlEntities([
      'CREATE TABLE users (',
      '  age INT,',
      '  is_active BOOL,',
      '  balance DECIMAL(10, 2)',
      ');',
    ].join('\n'));

    expect(entity.fields.get('age')?.type).toBe('integer');
    expect(entity.fields.get('is_active')?.type).toBe('boolean');
    expect(entity.fields.get('balance')?.type).toBe('numeric(10,2)');
  });

  it('normalizes sequence-backed serial aliases conservatively', () => {
    const [entity] = parseSqlEntities([
      'CREATE TABLE users (',
      '  id SERIAL PRIMARY KEY,',
      '  audit_id BIGSERIAL',
      ');',
    ].join('\n'));

    expect(entity.fields.get('id')).toMatchObject({
      type: 'integer',
      defaultValue: '@generated_increment',
      hasDefault: true,
      primaryKey: true,
    });
    expect(entity.fields.get('audit_id')).toMatchObject({
      type: 'bigint',
      defaultValue: '@generated_increment',
      hasDefault: true,
    });
  });

  it('normalizes conservative postgres temporal aliases and explicit time zone forms', () => {
    const [entity] = parseSqlEntities([
      'CREATE TABLE audit_log (',
      '  created_at TIMESTAMPTZ NOT NULL,',
      '  reviewed_at TIMESTAMP WITH TIME ZONE,',
      '  starts_at TIMESTAMP(3) WITHOUT TIME ZONE,',
      '  wake_at TIMETZ,',
      '  quiet_at TIME WITH TIME ZONE',
      ');',
    ].join('\n'));

    expect(entity.fields.get('created_at')?.type).toBe('timestamp with time zone');
    expect(entity.fields.get('reviewed_at')?.type).toBe('timestamp with time zone');
    expect(entity.fields.get('starts_at')?.type).toBe('timestamp(3)');
    expect(entity.fields.get('wake_at')?.type).toBe('time with time zone');
    expect(entity.fields.get('quiet_at')?.type).toBe('time with time zone');
  });

  it('normalizes conservative postgres numeric aliases', () => {
    const [entity] = parseSqlEntities([
      'CREATE TABLE metrics (',
      '  aggregate_id INT8 NOT NULL,',
      '  average_score FLOAT8,',
      '  percentile DOUBLE PRECISION',
      ');',
    ].join('\n'));

    expect(entity.fields.get('aggregate_id')?.type).toBe('bigint');
    expect(entity.fields.get('average_score')?.type).toBe('double precision');
    expect(entity.fields.get('percentile')?.type).toBe('double precision');
  });

  it('normalizes Prisma generated defaults and updatedAt fields', () => {
    const [entity] = parsePrismaEntities([
      'model User {',
      '  id String @id @default(dbgenerated("gen_random_uuid()"))',
      '  status String',
      '  updatedAt DateTime @updatedAt',
      '}',
    ].join('\n'));

    expect(entity.name).toBe('User');
    expect(entity.fields.get('id')).toMatchObject({
      defaultValue: '@generated_uuid',
      primaryKey: true,
    });
    expect(entity.fields.get('updatedAt')).toMatchObject({
      defaultValue: '@updatedat',
      hasDefault: true,
    });
  });

  it('normalizes character-type aliases (character varying, char, character)', () => {
    const [entity] = parseSqlEntities([
      'CREATE TABLE users (',
      '  name CHARACTER VARYING(255),',
      '  code CHAR VARYING(10),',
      '  gender CHARACTER(1),',
      '  bio VARCHAR(500),',
      ');',
    ].join('\n'));

    expect(entity.fields.get('name')?.type).toBe('varchar(255)');
    expect(entity.fields.get('code')?.type).toBe('varchar(10)');
    expect(entity.fields.get('gender')?.type).toBe('char(1)');
    expect(entity.fields.get('bio')?.type).toBe('varchar(500)');
  });

  it('normalizes sequence-backed increment defaults across sql and prisma forms', () => {
    const [sqlEntity] = parseSqlEntities([
      'CREATE TABLE users (',
      "  id INTEGER NOT NULL DEFAULT nextval('users_id_seq'::regclass),",
      '  PRIMARY KEY (id)',
      ');',
    ].join('\n'));
    const [prismaEntity] = parsePrismaEntities([
      'model User {',
      "  id Int @id @default(dbgenerated(\"nextval('users_id_seq'::regclass)\"))",
      '  rank Int @default(autoincrement())',
      '}',
    ].join('\n'));

    expect(sqlEntity.fields.get('id')?.defaultValue).toBe('@generated_increment');
    expect(prismaEntity.fields.get('id')?.defaultValue).toBe('@generated_increment');
    expect(prismaEntity.fields.get('rank')?.defaultValue).toBe('@generated_increment');
  });
});
