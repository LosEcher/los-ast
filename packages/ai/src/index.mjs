import path from 'node:path'
import { OUTPUT_SCHEMA_SPEC } from './output-schema-spec.mjs'

export function outputSchemaPath() {
  return path.resolve(new URL('../schemas/los-ast-output.schema.json', import.meta.url).pathname)
}

export function buildOutputSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'los-ast JSONL output record',
    type: 'object',
    additionalProperties: true,
    required: [...OUTPUT_SCHEMA_SPEC.required],
    properties: OUTPUT_SCHEMA_SPEC.properties,
  }
}
