import type {
  ContractArtifactFindingInput,
  OpenApiComparisonInput,
  OpenApiDocumentInput,
} from '@los-ast/shared/types';
import {
  buildDiscriminatorExcerpt,
  ensureOpenApiShape,
  getComparableObjectShape,
  getOperations,
  getRequestSchema,
  getSuccessResponseSchemas,
  hasEffectiveSecurity,
  HTTP_METHODS,
  isRecord,
  MUTATING_METHODS,
  parseDocument,
  resolveOperationLine,
} from './openapi-artifacts/shared.js';

function buildContractFinding(
  source: string,
  file: string,
  line: number,
  ruleId: string,
  severity: 'info' | 'warning' | 'error',
  message: string,
  excerpt: string,
  governanceDomain: string[],
  impactHint: 'low' | 'medium' | 'high'
): ContractArtifactFindingInput {
  return {
    source,
    ruleId,
    severity,
    message,
    file,
    language: 'contract',
    line,
    column: 0,
    excerpt,
    governanceDomain,
    impactHint,
  };
}

function getResponseExcerptPrefix(status: string): string {
  return `response[${status}]`;
}

export function buildContractArtifactsFromOpenApi(
  documents: OpenApiDocumentInput[] | undefined
): ContractArtifactFindingInput[] {
  if (!Array.isArray(documents) || documents.length === 0) {
    return [];
  }

  const artifacts: ContractArtifactFindingInput[] = [];

  documents.forEach((document, docIndex) => {
    const sourceLabel = document.source || document.file || `openapi-${docIndex + 1}`;
    const fileLabel = document.file || sourceLabel;
    const parsed = parseDocument(document, docIndex);
    ensureOpenApiShape(parsed, sourceLabel);

    for (const [routePath, pathItem] of Object.entries(parsed.paths || {})) {
      if (!isRecord(pathItem)) {
        continue;
      }

      for (const [method, operationRaw] of Object.entries(pathItem)) {
        if (!HTTP_METHODS.has(method)) {
          continue;
        }
        if (!isRecord(operationRaw)) {
          continue;
        }

        const operation = operationRaw;
        const methodUpper = method.toUpperCase();
        const operationLabel = `${methodUpper} ${routePath}`;
        const findingLine = resolveOperationLine(document, operationLabel);

        if (typeof operation.operationId !== 'string' || operation.operationId.trim().length === 0) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-operation-id',
            'warning',
            `OpenAPI operation ${operationLabel} is missing operationId`,
            operationLabel,
            ['interface', 'backend'],
            'medium',
          ));
        }

        if (MUTATING_METHODS.has(method) && !hasEffectiveSecurity(operation, parsed.security)) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-auth-required',
            'error',
            `OpenAPI operation ${operationLabel} should declare security requirements`,
            operationLabel,
            ['backend', 'interface'],
            'high',
          ));
        }

        const responses = operation.responses;
        const hasSuccessResponse = isRecord(responses)
          && Object.keys(responses).some((status) => /^2\d\d$/.test(status) || status === 'default');

        if (!hasSuccessResponse) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-success-response',
            'warning',
            `OpenAPI operation ${operationLabel} should declare at least one success response`,
            operationLabel,
            ['interface'],
            'medium',
          ));
        }
      }
    }
  });

  return artifacts;
}

export function buildContractArtifactsFromOpenApiComparisons(
  comparisons: OpenApiComparisonInput[] | undefined
): ContractArtifactFindingInput[] {
  if (!Array.isArray(comparisons) || comparisons.length === 0) {
    return [];
  }

  const artifacts: ContractArtifactFindingInput[] = [];

  comparisons.forEach((comparison, index) => {
    const sourceLabel = comparison.source || comparison.file || `openapi-comparison-${index + 1}`;
    const fileLabel = comparison.file || sourceLabel;
    const baselineDocument = {
      source: `${sourceLabel}:baseline`,
      file: comparison.file,
      content: comparison.baseline,
      format: comparison.format,
    } satisfies OpenApiDocumentInput;
    const currentDocument = {
      source: `${sourceLabel}:current`,
      file: comparison.file,
      content: comparison.current,
      format: comparison.format,
    } satisfies OpenApiDocumentInput;
    const baseline = parseDocument(baselineDocument, index);
    const current = parseDocument(currentDocument, index);

    ensureOpenApiShape(baseline, sourceLabel);
    ensureOpenApiShape(current, sourceLabel);

    const baselineOperations = getOperations(baseline);
    const currentOperations = getOperations(current);

    for (const [operationLabel, baselineOperation] of baselineOperations.entries()) {
      const currentOperation = currentOperations.get(operationLabel);
      const baselineLine = resolveOperationLine(baselineDocument, operationLabel);
      const currentLine = resolveOperationLine(currentDocument, operationLabel);
      const findingLine = currentOperation ? currentLine || baselineLine : baselineLine;
      if (!currentOperation) {
        artifacts.push(buildContractFinding(
          sourceLabel,
          fileLabel,
          findingLine,
          'contract/openapi-breaking-operation-drop',
          'error',
          `OpenAPI operation ${operationLabel} was removed from current spec`,
          operationLabel,
          ['interface', 'backend'],
          'high',
        ));
        continue;
      }

      const baselineRequestShape = getComparableObjectShape(baseline, getRequestSchema(baselineOperation));
      const currentRequestShape = getComparableObjectShape(current, getRequestSchema(currentOperation));
      for (const [schemaPath, baselineDiscriminator] of baselineRequestShape.discriminators.entries()) {
        const currentDiscriminator = currentRequestShape.discriminators.get(schemaPath);
        const requestExcerptPrefix = `${operationLabel} request`;
        if (!currentDiscriminator || baselineDiscriminator.propertyName !== currentDiscriminator.propertyName) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-breaking-request-discriminator-change',
            'error',
            `OpenAPI operation ${operationLabel} changed request discriminator property at ${schemaPath || 'root'}`,
            buildDiscriminatorExcerpt(
              requestExcerptPrefix,
              baselineRequestShape.pathSuffix,
              schemaPath,
              baselineDiscriminator.propertyName
            ),
            ['interface', 'backend'],
            'high',
          ));
        }

        if (!currentDiscriminator) {
          continue;
        }

        const droppedRequestMappings = baselineDiscriminator.mappingKeys
          .filter((value) => !currentDiscriminator.mappingKeys.includes(value));
        if (droppedRequestMappings.length > 0) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-breaking-request-discriminator-value-drop',
            'error',
            `OpenAPI operation ${operationLabel} removed request discriminator values at ${schemaPath || 'root'}`,
            `${buildDiscriminatorExcerpt(requestExcerptPrefix, baselineRequestShape.pathSuffix, schemaPath, baselineDiscriminator.propertyName)}: dropped ${droppedRequestMappings.join(', ')}`,
            ['interface', 'backend'],
            'high',
          ));
        }
      }
      for (const [fieldName, baselineField] of baselineRequestShape.properties.entries()) {
        const currentField = currentRequestShape.properties.get(fieldName);
        if (!currentField) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-breaking-request-field-drop',
            'error',
            `OpenAPI operation ${operationLabel} removed request field ${fieldName}`,
            `${operationLabel} request${baselineRequestShape.pathSuffix}.${fieldName}`,
            ['interface', 'backend'],
            'high',
          ));
          continue;
        }

        if (baselineField.type !== currentField.type) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-breaking-request-field-type-change',
            'error',
            `OpenAPI operation ${operationLabel} changed request field ${fieldName} type from ${baselineField.type} to ${currentField.type}`,
            `${operationLabel} request${baselineRequestShape.pathSuffix}.${fieldName}: ${baselineField.type} -> ${currentField.type}`,
            ['interface', 'backend'],
            'high',
          ));
        }

        if (baselineField.nullable && !currentField.nullable) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-breaking-request-nullable-tighten',
            'error',
            `OpenAPI operation ${operationLabel} changed request field ${fieldName} from nullable to non-nullable`,
            `${operationLabel} request${baselineRequestShape.pathSuffix}.${fieldName}: nullable -> non-nullable`,
            ['interface', 'backend'],
            'high',
          ));
        }

        const droppedRequestEnumValues = baselineField.enumValues.filter((value) => !currentField.enumValues.includes(value));
        if (droppedRequestEnumValues.length > 0) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-breaking-request-enum-value-drop',
            'error',
            `OpenAPI operation ${operationLabel} removed request enum values from field ${fieldName}`,
            `${operationLabel} request${baselineRequestShape.pathSuffix}.${fieldName}: dropped ${droppedRequestEnumValues.join(', ')}`,
            ['interface', 'backend'],
            'high',
          ));
        }

        if (baselineField.hasDefault && !currentField.hasDefault) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-request-default-removed',
            'warning',
            `OpenAPI operation ${operationLabel} removed default from request field ${fieldName}`,
            `${operationLabel} request${baselineRequestShape.pathSuffix}.${fieldName}: default removed`,
            ['interface', 'backend'],
            'medium',
          ));
        } else if (
          baselineField.hasDefault
          && currentField.hasDefault
          && baselineField.defaultValue !== currentField.defaultValue
        ) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-request-default-changed',
            'warning',
            `OpenAPI operation ${operationLabel} changed default for request field ${fieldName}`,
            `${operationLabel} request${baselineRequestShape.pathSuffix}.${fieldName}: ${baselineField.defaultValue} -> ${currentField.defaultValue}`,
            ['interface', 'backend'],
            'medium',
          ));
        }
      }
      for (const requiredField of currentRequestShape.required) {
        if (!baselineRequestShape.required.has(requiredField)) {
          const currentRequiredField = currentRequestShape.properties.get(requiredField);
          if (currentRequiredField?.hasDefault) {
            artifacts.push(buildContractFinding(
              sourceLabel,
              fileLabel,
              findingLine,
              'contract/openapi-request-required-add-with-default',
              'warning',
              `OpenAPI operation ${operationLabel} added required request field ${requiredField} with a default`,
              `${operationLabel} request${currentRequestShape.pathSuffix || baselineRequestShape.pathSuffix}.${requiredField}: required + default`,
              ['interface', 'backend'],
              'medium',
            ));
            continue;
          }

          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-breaking-request-required-add',
            'error',
            `OpenAPI operation ${operationLabel} added required request field ${requiredField}`,
            `${operationLabel} request${currentRequestShape.pathSuffix || baselineRequestShape.pathSuffix}.${requiredField}`,
            ['interface', 'backend'],
            'high',
          ));
        }
      }

      const baselineResponseSchemas = getSuccessResponseSchemas(baselineOperation);
      const currentResponseSchemas = getSuccessResponseSchemas(currentOperation);
      for (const [status, baselineResponseSchema] of baselineResponseSchemas.entries()) {
        const currentResponseSchema = currentResponseSchemas.get(status);
        if (!currentResponseSchema) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-breaking-response-status-drop',
            'error',
            `OpenAPI operation ${operationLabel} removed success response ${status}`,
            `${operationLabel} ${getResponseExcerptPrefix(status)}`,
            ['interface', 'backend'],
            'high',
          ));
          continue;
        }

        const baselineResponseShape = getComparableObjectShape(baseline, baselineResponseSchema);
        const currentResponseShape = getComparableObjectShape(current, currentResponseSchema);
        const responseExcerptPrefix = getResponseExcerptPrefix(status);
        for (const [schemaPath, baselineDiscriminator] of baselineResponseShape.discriminators.entries()) {
          const currentDiscriminator = currentResponseShape.discriminators.get(schemaPath);
          const responseBasePrefix = `${operationLabel} ${responseExcerptPrefix}`;
          if (!currentDiscriminator || baselineDiscriminator.propertyName !== currentDiscriminator.propertyName) {
            artifacts.push(buildContractFinding(
              sourceLabel,
              fileLabel,
              findingLine,
              'contract/openapi-breaking-response-discriminator-change',
              'error',
              `OpenAPI operation ${operationLabel} changed response discriminator property at ${schemaPath || 'root'} on success response ${status}`,
              buildDiscriminatorExcerpt(
                responseBasePrefix,
                baselineResponseShape.pathSuffix,
                schemaPath,
                baselineDiscriminator.propertyName
              ),
              ['interface', 'backend'],
              'high',
            ));
          }

          if (!currentDiscriminator) {
            continue;
          }

          const droppedResponseMappings = baselineDiscriminator.mappingKeys
            .filter((value) => !currentDiscriminator.mappingKeys.includes(value));
          if (droppedResponseMappings.length > 0) {
            artifacts.push(buildContractFinding(
              sourceLabel,
              fileLabel,
              findingLine,
              'contract/openapi-breaking-response-discriminator-value-drop',
              'error',
              `OpenAPI operation ${operationLabel} removed response discriminator values at ${schemaPath || 'root'} on success response ${status}`,
              `${buildDiscriminatorExcerpt(responseBasePrefix, baselineResponseShape.pathSuffix, schemaPath, baselineDiscriminator.propertyName)}: dropped ${droppedResponseMappings.join(', ')}`,
              ['interface', 'backend'],
              'high',
            ));
          }
        }
        for (const [fieldName, baselineField] of baselineResponseShape.properties.entries()) {
          const currentField = currentResponseShape.properties.get(fieldName);
          if (!currentField) {
            artifacts.push(buildContractFinding(
              sourceLabel,
              fileLabel,
              findingLine,
              'contract/openapi-breaking-response-field-drop',
              'error',
              `OpenAPI operation ${operationLabel} removed response field ${fieldName} from success response ${status}`,
              `${operationLabel} ${responseExcerptPrefix}${baselineResponseShape.pathSuffix}.${fieldName}`,
              ['interface', 'backend'],
              'high',
            ));
            continue;
          }

          if (baselineField.type !== currentField.type) {
            artifacts.push(buildContractFinding(
              sourceLabel,
              fileLabel,
              findingLine,
              'contract/openapi-breaking-response-field-type-change',
              'error',
              `OpenAPI operation ${operationLabel} changed response field ${fieldName} type from ${baselineField.type} to ${currentField.type} on success response ${status}`,
              `${operationLabel} ${responseExcerptPrefix}${baselineResponseShape.pathSuffix}.${fieldName}: ${baselineField.type} -> ${currentField.type}`,
              ['interface', 'backend'],
              'high',
            ));
          }

          if (baselineField.nullable && !currentField.nullable) {
            artifacts.push(buildContractFinding(
              sourceLabel,
              fileLabel,
              findingLine,
              'contract/openapi-breaking-response-nullable-tighten',
              'error',
              `OpenAPI operation ${operationLabel} changed response field ${fieldName} from nullable to non-nullable on success response ${status}`,
              `${operationLabel} ${responseExcerptPrefix}${baselineResponseShape.pathSuffix}.${fieldName}: nullable -> non-nullable`,
              ['interface', 'backend'],
              'high',
            ));
          }

          const droppedResponseEnumValues = baselineField.enumValues.filter((value) => !currentField.enumValues.includes(value));
          if (droppedResponseEnumValues.length > 0) {
            artifacts.push(buildContractFinding(
              sourceLabel,
              fileLabel,
              findingLine,
              'contract/openapi-breaking-response-enum-value-drop',
              'error',
              `OpenAPI operation ${operationLabel} removed response enum values from field ${fieldName} on success response ${status}`,
              `${operationLabel} ${responseExcerptPrefix}${baselineResponseShape.pathSuffix}.${fieldName}: dropped ${droppedResponseEnumValues.join(', ')}`,
              ['interface', 'backend'],
              'high',
            ));
          }

          if (baselineField.hasDefault && !currentField.hasDefault) {
            artifacts.push(buildContractFinding(
              sourceLabel,
              fileLabel,
              findingLine,
              'contract/openapi-response-default-removed',
              'warning',
              `OpenAPI operation ${operationLabel} removed default from response field ${fieldName} on success response ${status}`,
              `${operationLabel} ${responseExcerptPrefix}${baselineResponseShape.pathSuffix}.${fieldName}: default removed`,
              ['interface', 'backend'],
              'medium',
            ));
          } else if (
            baselineField.hasDefault
            && currentField.hasDefault
            && baselineField.defaultValue !== currentField.defaultValue
          ) {
            artifacts.push(buildContractFinding(
              sourceLabel,
              fileLabel,
              findingLine,
              'contract/openapi-response-default-changed',
              'warning',
              `OpenAPI operation ${operationLabel} changed default for response field ${fieldName} on success response ${status}`,
              `${operationLabel} ${responseExcerptPrefix}${baselineResponseShape.pathSuffix}.${fieldName}: ${baselineField.defaultValue} -> ${currentField.defaultValue}`,
              ['interface', 'backend'],
              'medium',
            ));
          }

          if (baselineResponseShape.required.has(fieldName) && !currentResponseShape.required.has(fieldName)) {
            artifacts.push(buildContractFinding(
              sourceLabel,
              fileLabel,
              findingLine,
              'contract/openapi-breaking-response-required-drop',
              'error',
              `OpenAPI operation ${operationLabel} changed response field ${fieldName} from required to optional on success response ${status}`,
              `${operationLabel} ${responseExcerptPrefix}${baselineResponseShape.pathSuffix}.${fieldName}: required -> optional`,
              ['interface', 'backend'],
              'high',
            ));
          }
        }
      }
    }
  });

  return artifacts;
}
