import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArtifactInputs } from '../../src/services/artifact-parsers/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../../../fixtures/artifact-parsers');

type ExpectedFixture = {
  profile: string;
  findingSource: 'contract' | 'schema';
  expectedRuleIds: string[];
};

describe('Artifact Parser Golden', () => {
  it('openapi-native fixture should stay stable', () => {
    const content = fs.readFileSync(path.join(fixturesDir, 'openapi-minimal.yaml'), 'utf8');
    const expected = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'openapi-minimal.expected.json'), 'utf8')
    ) as ExpectedFixture;

    const result = parseArtifactInputs({
      openApiDocuments: [
        {
          source: 'openapi-minimal',
          file: 'fixtures/artifact-parsers/openapi-minimal.yaml',
          content,
          format: 'yaml',
        },
      ],
    });

    expect(result.contractArtifacts.map((item) => item.ruleId)).toEqual(expected.expectedRuleIds);
    expect(expected.findingSource).toBe('contract');
  });

  it('schema-native sql fixture should stay stable', () => {
    const content = fs.readFileSync(path.join(fixturesDir, 'schema-minimal.sql'), 'utf8');
    const expected = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'schema-minimal-sql.expected.json'), 'utf8')
    ) as ExpectedFixture;

    const result = parseArtifactInputs({
      schemaDocuments: [
        {
          source: 'schema-minimal-sql',
          file: 'fixtures/artifact-parsers/schema-minimal.sql',
          content,
          format: 'sql',
        },
      ],
    });

    expect(result.schemaArtifacts.map((item) => item.ruleId)).toEqual(expected.expectedRuleIds);
    expect(expected.findingSource).toBe('schema');
  });

  it('schema-native prisma fixture should stay stable', () => {
    const content = fs.readFileSync(path.join(fixturesDir, 'schema-minimal.prisma'), 'utf8');
    const expected = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'schema-minimal-prisma.expected.json'), 'utf8')
    ) as ExpectedFixture;

    const result = parseArtifactInputs({
      schemaDocuments: [
        {
          source: 'schema-minimal-prisma',
          file: 'fixtures/artifact-parsers/schema-minimal.prisma',
          content,
          format: 'prisma',
        },
      ],
    });

    expect(result.schemaArtifacts.map((item) => item.ruleId)).toEqual(expected.expectedRuleIds);
    expect(expected.findingSource).toBe('schema');
  });

  it('schema comparison fixture should stay stable', () => {
    const baseline = fs.readFileSync(path.join(fixturesDir, 'schema-compare-baseline.prisma'), 'utf8');
    const current = fs.readFileSync(path.join(fixturesDir, 'schema-compare-current.prisma'), 'utf8');
    const expected = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'schema-compare.expected.json'), 'utf8')
    ) as ExpectedFixture;

    const result = parseArtifactInputs({
      schemaComparisons: [
        {
          source: 'schema-compare',
          file: 'fixtures/artifact-parsers/schema-compare.prisma',
          baseline,
          current,
          format: 'prisma',
        },
      ],
    });

    expect(result.schemaArtifacts.map((item) => item.ruleId)).toEqual(expected.expectedRuleIds);
    expect(expected.findingSource).toBe('schema');
  });

  it('openapi comparison fixture should stay stable', () => {
    const baseline = fs.readFileSync(path.join(fixturesDir, 'openapi-compare-baseline.yaml'), 'utf8');
    const current = fs.readFileSync(path.join(fixturesDir, 'openapi-compare-current.yaml'), 'utf8');
    const expected = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'openapi-compare.expected.json'), 'utf8')
    ) as ExpectedFixture;

    const result = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare',
          file: 'fixtures/artifact-parsers/openapi-compare.yaml',
          baseline,
          current,
          format: 'yaml',
        },
      ],
    });

    expect(result.contractArtifacts.map((item) => item.ruleId)).toEqual(expected.expectedRuleIds);
    expect(expected.findingSource).toBe('contract');
  });
});
