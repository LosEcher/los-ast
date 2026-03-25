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
});
