import type { ContractArtifactFindingInput } from '@los-ast/shared/types';
import type { ComparableDiscriminator } from './types.js';
import { buildDiscriminatorExcerpt } from './schema-comparator.js';

export function buildRequestDiscriminatorFindings(
  sourceLabel: string,
  fileLabel: string,
  findingLine: number,
  operationLabel: string,
  schemaPath: string,
  baselineDiscriminator: ComparableDiscriminator,
  currentDiscriminator: ComparableDiscriminator | undefined,
  baselineRequestShape: { discriminators: Map<string, ComparableDiscriminator>; properties: Map<string, any>; required: Set<string>; pathSuffix: string },
  buildFinding: (
    source: string,
    file: string,
    line: number,
    ruleId: string,
    severity: 'info' | 'warning' | 'error',
    message: string,
    excerpt: string,
    governanceDomain: string[],
    impactHint: 'low' | 'medium' | 'high',
  ) => ContractArtifactFindingInput,
): ContractArtifactFindingInput[] {
  const findings: ContractArtifactFindingInput[] = [];
  const excerptPrefix = `${operationLabel} request`;

  if (!currentDiscriminator || baselineDiscriminator.propertyName !== currentDiscriminator.propertyName) {
    findings.push(buildFinding(
      sourceLabel,
      fileLabel,
      findingLine,
      'contract/openapi-breaking-request-discriminator-change',
      'error',
      `OpenAPI operation ${operationLabel} changed request discriminator property at ${schemaPath || 'root'}`,
      buildDiscriminatorExcerpt(excerptPrefix, baselineRequestShape.pathSuffix, schemaPath, baselineDiscriminator.propertyName),
      ['interface', 'backend'],
      'high',
    ));
  }

  if (!currentDiscriminator) {
    return findings;
  }

  const droppedMappings = baselineDiscriminator.mappingKeys
    .filter((value) => !currentDiscriminator.mappingKeys.includes(value));
  if (droppedMappings.length > 0) {
    findings.push(buildFinding(
      sourceLabel,
      fileLabel,
      findingLine,
      'contract/openapi-breaking-request-discriminator-value-drop',
      'error',
      `OpenAPI operation ${operationLabel} removed request discriminator values at ${schemaPath || 'root'}`,
      `${buildDiscriminatorExcerpt(excerptPrefix, baselineRequestShape.pathSuffix, schemaPath, baselineDiscriminator.propertyName)}: dropped ${droppedMappings.join(', ')}`,
      ['interface', 'backend'],
      'high',
    ));
  }

  const addedMappings = currentDiscriminator.mappingKeys
    .filter((value) => !baselineDiscriminator.mappingKeys.includes(value));
  if (addedMappings.length > 0) {
    findings.push(buildFinding(
      sourceLabel,
      fileLabel,
      findingLine,
      'contract/openapi-request-discriminator-value-add',
      'warning',
      `OpenAPI operation ${operationLabel} added new request discriminator values at ${schemaPath || 'root'}`,
      `${buildDiscriminatorExcerpt(excerptPrefix, baselineRequestShape.pathSuffix, schemaPath, baselineDiscriminator.propertyName)}: added ${addedMappings.join(', ')}`,
      ['interface', 'backend'],
      'medium',
    ));
  }

  for (const mappingKey of baselineDiscriminator.mappingKeys) {
    if (!currentDiscriminator.mappingKeys.includes(mappingKey)) {
      continue;
    }
    const baselineTarget = baselineDiscriminator.mapping[mappingKey];
    const currentTarget = currentDiscriminator.mapping[mappingKey];
    if (baselineTarget !== currentTarget) {
      findings.push(buildFinding(
        sourceLabel,
        fileLabel,
        findingLine,
        'contract/openapi-breaking-request-discriminator-value-change',
        'error',
        `OpenAPI operation ${operationLabel} changed request discriminator mapping ${mappingKey} target from ${baselineTarget} to ${currentTarget}`,
        `${buildDiscriminatorExcerpt(excerptPrefix, baselineRequestShape.pathSuffix, schemaPath, baselineDiscriminator.propertyName)}.${mappingKey}: ${baselineTarget} -> ${currentTarget}`,
        ['interface', 'backend'],
        'high',
      ));
    }
  }

  return findings;
}

export function buildResponseDiscriminatorFindings(
  sourceLabel: string,
  fileLabel: string,
  findingLine: number,
  operationLabel: string,
  status: string,
  schemaPath: string,
  baselineDiscriminator: ComparableDiscriminator,
  currentDiscriminator: ComparableDiscriminator | undefined,
  baselineResponseShape: { discriminators: Map<string, ComparableDiscriminator>; properties: Map<string, any>; required: Set<string>; pathSuffix: string },
  buildFinding: (
    source: string,
    file: string,
    line: number,
    ruleId: string,
    severity: 'info' | 'warning' | 'error',
    message: string,
    excerpt: string,
    governanceDomain: string[],
    impactHint: 'low' | 'medium' | 'high',
  ) => ContractArtifactFindingInput,
): ContractArtifactFindingInput[] {
  const findings: ContractArtifactFindingInput[] = [];
  const excerptPrefix = `${operationLabel} response[${status}]`;

  if (!currentDiscriminator || baselineDiscriminator.propertyName !== currentDiscriminator.propertyName) {
    findings.push(buildFinding(
      sourceLabel,
      fileLabel,
      findingLine,
      'contract/openapi-breaking-response-discriminator-change',
      'error',
      `OpenAPI operation ${operationLabel} changed response discriminator property at ${schemaPath || 'root'} on success response ${status}`,
      buildDiscriminatorExcerpt(excerptPrefix, baselineResponseShape.pathSuffix, schemaPath, baselineDiscriminator.propertyName),
      ['interface', 'backend'],
      'high',
    ));
  }

  if (!currentDiscriminator) {
    return findings;
  }

  const droppedMappings = baselineDiscriminator.mappingKeys
    .filter((value) => !currentDiscriminator.mappingKeys.includes(value));
  if (droppedMappings.length > 0) {
    findings.push(buildFinding(
      sourceLabel,
      fileLabel,
      findingLine,
      'contract/openapi-breaking-response-discriminator-value-drop',
      'error',
      `OpenAPI operation ${operationLabel} removed response discriminator values at ${schemaPath || 'root'} on success response ${status}`,
      `${buildDiscriminatorExcerpt(excerptPrefix, baselineResponseShape.pathSuffix, schemaPath, baselineDiscriminator.propertyName)}: dropped ${droppedMappings.join(', ')}`,
      ['interface', 'backend'],
      'high',
    ));
  }

  const addedMappings = currentDiscriminator.mappingKeys
    .filter((value) => !baselineDiscriminator.mappingKeys.includes(value));
  if (addedMappings.length > 0) {
    findings.push(buildFinding(
      sourceLabel,
      fileLabel,
      findingLine,
      'contract/openapi-response-discriminator-value-add',
      'warning',
      `OpenAPI operation ${operationLabel} added new response discriminator values at ${schemaPath || 'root'} on success response ${status}`,
      `${buildDiscriminatorExcerpt(excerptPrefix, baselineResponseShape.pathSuffix, schemaPath, baselineDiscriminator.propertyName)}: added ${addedMappings.join(', ')}`,
      ['interface', 'backend'],
      'medium',
    ));
  }

  for (const mappingKey of baselineDiscriminator.mappingKeys) {
    if (!currentDiscriminator.mappingKeys.includes(mappingKey)) {
      continue;
    }
    const baselineTarget = baselineDiscriminator.mapping[mappingKey];
    const currentTarget = currentDiscriminator.mapping[mappingKey];
    if (baselineTarget !== currentTarget) {
      findings.push(buildFinding(
        sourceLabel,
        fileLabel,
        findingLine,
        'contract/openapi-breaking-response-discriminator-value-change',
        'error',
        `OpenAPI operation ${operationLabel} changed response discriminator mapping ${mappingKey} target from ${baselineTarget} to ${currentTarget} on success response ${status}`,
        `${buildDiscriminatorExcerpt(excerptPrefix, baselineResponseShape.pathSuffix, schemaPath, baselineDiscriminator.propertyName)}.${mappingKey}: ${baselineTarget} -> ${currentTarget}`,
        ['interface', 'backend'],
        'high',
      ));
    }
  }

  return findings;
}
