/**
 * OpenAPI Artifacts - Types
 * Extracted from shared.ts for better modularity
 */

export type OpenApiObject = {
  openapi?: string;
  security?: unknown[];
  paths?: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
  };
};

export type ComparableValidation = {
  exclusiveMaximum: boolean;
  exclusiveMinimum: boolean;
  format?: string;
  maxItems?: number;
  maxLength?: number;
  maxProperties?: number;
  maximum?: number;
  minItems?: number;
  minLength?: number;
  minProperties?: number;
  minimum?: number;
  multipleOf?: number;
  pattern?: string;
  uniqueItems: boolean;
};

export type ComparableField = {
  defaultValue?: string;
  enumValues: string[];
  hasDefault: boolean;
  nullable: boolean;
  type: string;
  validation: ComparableValidation;
};

export type ComparableDiscriminator = {
  mapping: Record<string, string>;
  mappingKeys: string[];
  propertyName: string;
};

export const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
export const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);
