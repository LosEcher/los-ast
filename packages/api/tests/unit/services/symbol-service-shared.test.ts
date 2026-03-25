import { describe, expect, it } from 'vitest';
import {
  assertNotAborted,
  buildSymbolsFromAstMatches,
  clampSymbolLimit,
  extractSymbolsFromSourceText,
  partitionSymbolsByLimit,
  toRange,
} from '../../../src/services/symbol-service/shared';

describe('symbol service shared helpers', () => {
  it('clamps limits, enforces aborts, and partitions truncated results predictably', () => {
    expect(clampSymbolLimit()).toBe(100);
    expect(clampSymbolLimit(0)).toBe(1);
    expect(clampSymbolLimit(5000)).toBe(1000);

    const acceptedSymbol = {
      name: 'alpha',
      kind: 'function' as const,
      file: '/tmp/a.ts',
      range: toRange('function alpha() {}', 9, 5),
    };
    const overflowSymbol = {
      name: 'beta',
      kind: 'function' as const,
      file: '/tmp/a.ts',
      range: toRange('function beta() {}', 9, 4),
    };
    expect(partitionSymbolsByLimit(1, [acceptedSymbol, overflowSymbol], 2)).toEqual({
      accepted: [acceptedSymbol],
      overflow: [overflowSymbol],
      truncated: true,
    });

    expect(() => assertNotAborted(new AbortController().signal)).not.toThrow();
    const controller = new AbortController();
    controller.abort();
    expect(() => assertNotAborted(controller.signal)).toThrow('Operation aborted');
  });

  it('maps AST matches conservatively and computes stable ranges', () => {
    expect(toRange('const foo = 1;\nconst bar = 2;', 21, 3)).toEqual({
      start: { line: 2, column: 6, index: 21 },
      end: { line: 2, column: 9, index: 24 },
    });

    const symbols = buildSymbolsFromAstMatches({
      file: '/tmp/example.ts',
      kind: 'function',
      matches: [
        {
          getMatch: () => ({ text: () => 'alpha' }),
          range: () => ({
            start: { line: 1, column: 0, index: 0 },
            end: { line: 1, column: 5, index: 5 },
          }),
        },
        {
          getMatch: () => null,
          range: () => ({
            start: { line: 2, column: 0, index: 6 },
            end: { line: 2, column: 4, index: 10 },
          }),
        },
      ],
    });

    expect(symbols).toEqual([
      {
        name: 'alpha',
        kind: 'function',
        file: '/tmp/example.ts',
        range: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 5, index: 5 },
        },
      },
    ]);
  });

  it('extracts text fallback symbols repeatedly without leaking regex state', () => {
    const source = `
export interface UserProfile {}
export type UserId = string
export async function loadUser() {}
const renderUser = () => {}
const value = 1
`;

    const firstPass = extractSymbolsFromSourceText({
      source,
      file: '/tmp/example.ts',
      language: 'typescript',
    });
    const secondPass = extractSymbolsFromSourceText({
      source,
      file: '/tmp/example.ts',
      language: 'typescript',
    });

    expect(firstPass).toEqual(secondPass);
    expect(firstPass.map((item) => `${item.kind}:${item.name}`)).toEqual([
      'function:loadUser',
      'function:renderUser',
      'interface:UserProfile',
      'type:UserId',
      'variable:renderUser',
      'variable:value',
    ]);
    expect(firstPass[0]?.range.start.line).toBe(4);
  });
});
