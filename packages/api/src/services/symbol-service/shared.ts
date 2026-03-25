import type { SymbolInfo } from '@los-ast/shared/types';

export interface SymbolRule {
  kind: SymbolInfo['kind'];
  languages: string[];
  pattern: string;
}

export interface TextSymbolPattern {
  kind: SymbolInfo['kind'];
  languages: string[];
  regex: RegExp;
}

export interface AstSymbolRange {
  start: { line: number; column: number; index: number };
  end: { line: number; column: number; index: number };
}

export interface AstSymbolMatch {
  getMatch(name: string): { text: () => string } | null;
  range(): AstSymbolRange;
}

export const SYMBOL_RULES: SymbolRule[] = [
  {
    kind: 'function',
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    pattern: '(function_declaration name: (identifier) @name)',
  },
  {
    kind: 'function',
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    pattern: '(lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function)))',
  },
  {
    kind: 'class',
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    pattern: '(class_declaration name: (type_identifier) @name)',
  },
  {
    kind: 'interface',
    languages: ['typescript', 'tsx'],
    pattern: '(interface_declaration name: (type_identifier) @name)',
  },
  {
    kind: 'type',
    languages: ['typescript', 'tsx'],
    pattern: '(type_alias_declaration name: (type_identifier) @name)',
  },
  {
    kind: 'variable',
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    pattern: '(lexical_declaration (variable_declarator name: (identifier) @name))',
  },
  {
    kind: 'function',
    languages: ['rust'],
    pattern: '(function_item name: (identifier) @name)',
  },
  {
    kind: 'class',
    languages: ['rust'],
    pattern: '(struct_item name: (type_identifier) @name)',
  },
  {
    kind: 'interface',
    languages: ['rust'],
    pattern: '(trait_item name: (type_identifier) @name)',
  },
  {
    kind: 'type',
    languages: ['rust'],
    pattern: '(type_item name: (type_identifier) @name)',
  },
];

export const TEXT_SYMBOL_PATTERNS: TextSymbolPattern[] = [
  {
    kind: 'function',
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
  },
  {
    kind: 'function',
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm,
  },
  {
    kind: 'class',
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    regex: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)\b/gm,
  },
  {
    kind: 'interface',
    languages: ['typescript', 'tsx'],
    regex: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)\b/gm,
  },
  {
    kind: 'type',
    languages: ['typescript', 'tsx'],
    regex: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\b/gm,
  },
  {
    kind: 'variable',
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm,
  },
  {
    kind: 'function',
    languages: ['rust'],
    regex: /^\s*(?:pub\s+)?fn\s+([A-Za-z_][\w]*)\s*\(/gm,
  },
  {
    kind: 'class',
    languages: ['rust'],
    regex: /^\s*(?:pub\s+)?struct\s+([A-Za-z_][\w]*)\b/gm,
  },
  {
    kind: 'interface',
    languages: ['rust'],
    regex: /^\s*(?:pub\s+)?trait\s+([A-Za-z_][\w]*)\b/gm,
  },
  {
    kind: 'type',
    languages: ['rust'],
    regex: /^\s*(?:pub\s+)?type\s+([A-Za-z_][\w]*)\b/gm,
  },
];

export function clampSymbolLimit(limit = 100) {
  return Math.min(Math.max(1, limit), 1000);
}

export function assertNotAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new Error('Operation aborted');
  }
}

export function partitionSymbolsByLimit(existingCount: number, fileSymbols: SymbolInfo[], limit: number) {
  const remaining = Math.max(limit - existingCount, 0);
  if (remaining <= 0) {
    return {
      accepted: [] as SymbolInfo[],
      overflow: [...fileSymbols],
      truncated: fileSymbols.length > 0,
    };
  }

  if (fileSymbols.length <= remaining) {
    return {
      accepted: [...fileSymbols],
      overflow: [] as SymbolInfo[],
      truncated: false,
    };
  }

  return {
    accepted: fileSymbols.slice(0, remaining),
    overflow: fileSymbols.slice(remaining),
    truncated: true,
  };
}

export function buildSymbolsFromAstMatches({
  matches,
  kind,
  file,
}: {
  matches: AstSymbolMatch[];
  kind: SymbolInfo['kind'];
  file: string;
}): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  for (const node of matches) {
    const nameNode = node.getMatch('name');
    if (!nameNode) {
      continue;
    }

    const name = nameNode.text();
    if (!name) {
      continue;
    }

    const range = node.range();
    symbols.push({
      name,
      kind,
      file,
      range: {
        start: {
          line: range.start.line,
          column: range.start.column,
          index: range.start.index,
        },
        end: {
          line: range.end.line,
          column: range.end.column,
          index: range.end.index,
        },
      },
    });
  }

  return symbols;
}

export function extractSymbolsFromSourceText({
  source,
  file,
  language,
}: {
  source: string;
  file: string;
  language: string;
}): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const seen = new Set<string>();

  for (const pattern of TEXT_SYMBOL_PATTERNS) {
    if (!pattern.languages.includes(language)) {
      continue;
    }

    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null = pattern.regex.exec(source);
    while (match) {
      const name = String(match[1] ?? '').trim();
      if (name) {
        const nameIndex = match.index + match[0].indexOf(name);
        const dedupeKey = `${pattern.kind}:${name}:${nameIndex}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          symbols.push({
            name,
            kind: pattern.kind,
            file,
            range: toRange(source, nameIndex, name.length),
          });
        }
      }
      match = pattern.regex.exec(source);
    }
  }

  return symbols;
}

export function toRange(source: string, index: number, length: number) {
  const startPrefix = source.slice(0, index);
  const startLine = startPrefix.split('\n').length;
  const startColumn = index - (startPrefix.lastIndexOf('\n') + 1);
  const endIndex = index + length;
  const endPrefix = source.slice(0, endIndex);
  const endLine = endPrefix.split('\n').length;
  const endColumn = endIndex - (endPrefix.lastIndexOf('\n') + 1);

  return {
    start: {
      line: startLine,
      column: startColumn,
      index,
    },
    end: {
      line: endLine,
      column: endColumn,
      index: endIndex,
    },
  };
}
