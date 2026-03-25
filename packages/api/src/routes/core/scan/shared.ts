import { existsSync } from 'node:fs';
import path from 'node:path';

import { getBuiltInRulePackNames, getBuiltInRulePackPattern } from '@los-ast/rules';

import { ValidationError } from '../../../types/errors.js';
import {
  SCAN_NATIVE_INPUT_KEYS,
  type BuiltInRulePack,
  type ScanRequestBody,
} from '../scan-contract.js';

export const BUILT_IN_RULE_PACK_NAMES = getBuiltInRulePackNames();

function hasRuleCatalog(baseDir: string): boolean {
  const languageDir = path.join(baseDir, 'languages');
  const projectDir = path.join(baseDir, 'projects');

  return existsSync(languageDir) && existsSync(projectDir);
}

function isPreferredRuleRoot(baseDir: string): boolean {
  return path.basename(path.resolve(baseDir, '..')) !== 'packages';
}

let resolvedRulesRoot: string | null = null;

function resolveRulesRoot(): string {
  if (resolvedRulesRoot) {
    return resolvedRulesRoot;
  }

  const candidates = [
    path.resolve(process.cwd(), 'rules'),
    path.resolve(process.cwd(), '..', 'rules'),
    path.resolve(process.cwd(), '..', '..', 'rules'),
    path.resolve(process.cwd(), '..', '..', '..', 'rules'),
  ];

  const found = candidates.find(
    (candidate) => existsSync(candidate) && hasRuleCatalog(candidate) && isPreferredRuleRoot(candidate)
  ) ?? candidates.find(
    (candidate) => existsSync(candidate) && hasRuleCatalog(candidate)
  );
  resolvedRulesRoot = found ?? candidates[candidates.length - 1];
  return resolvedRulesRoot;
}

export function resolveRulePackPatterns(
  rulePack?: BuiltInRulePack,
  rulesRoot = resolveRulesRoot()
): string[] | undefined {
  if (!rulePack) {
    return undefined;
  }

  const relativePattern = getBuiltInRulePackPattern(rulePack);
  if (!relativePattern) {
    return undefined;
  }

  return [path.join(rulesRoot, relativePattern)];
}

export function hasNativeArtifactInputs(body: ScanRequestBody): boolean {
  return SCAN_NATIVE_INPUT_KEYS.some((key) => {
    const items = body[key];
    return Array.isArray(items) && items.length > 0;
  });
}

export function requiresCodeScan(body: ScanRequestBody, resolvedRules?: string[]): boolean {
  return typeof body.rootDir !== 'undefined'
    || (Array.isArray(body.include) && body.include.length > 0)
    || (Array.isArray(body.ignore) && body.ignore.length > 0)
    || (Array.isArray(body.rules) && body.rules.length > 0)
    || (Array.isArray(resolvedRules) && resolvedRules.length > 0);
}

export function validateScanRequestBody(
  body: ScanRequestBody,
  resolvedRules?: string[]
): void {
  const shouldRunCodeScan = requiresCodeScan(body, resolvedRules);
  const hasNativeInputs = hasNativeArtifactInputs(body);

  if (!body.project || typeof body.project !== 'string') {
    throw new ValidationError('INVALID_PROJECT', 'project must be a non-empty string');
  }

  if (!shouldRunCodeScan && !hasNativeInputs) {
    throw new ValidationError(
      'INVALID_SCAN_INPUT',
      'either rootDir or native artifact inputs must be provided'
    );
  }

  if (shouldRunCodeScan && (!body.rootDir || typeof body.rootDir !== 'string')) {
    throw new ValidationError(
      'INVALID_ROOTDIR',
      'rootDir must be a non-empty string'
    );
  }
}
