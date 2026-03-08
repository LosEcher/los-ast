import { discoverFiles, isReady, languageFromFilePath, defaultParseCache } from '@los-ast/core';
// AST-grep 规则定义 - 符号发现模式
const SYMBOL_RULES = [
    {
        kind: 'function',
        languages: ['typescript', 'javascript', 'tsx', 'jsx'],
        // 匹配函数声明: function foo() {}
        pattern: '(function_declaration name: (identifier) @name)',
    },
    {
        kind: 'function',
        languages: ['typescript', 'javascript', 'tsx', 'jsx'],
        // 匹配箭头函数变量: const foo = () => {}
        pattern: '(lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function)))',
    },
    {
        kind: 'class',
        languages: ['typescript', 'javascript', 'tsx', 'jsx'],
        // 匹配类声明: class Foo {}
        pattern: '(class_declaration name: (type_identifier) @name)',
    },
    {
        kind: 'interface',
        languages: ['typescript', 'tsx'],
        // 匹配接口声明: interface Foo {}
        pattern: '(interface_declaration name: (type_identifier) @name)',
    },
    {
        kind: 'type',
        languages: ['typescript', 'tsx'],
        // 匹配类型别名: type Foo = ...
        pattern: '(type_alias_declaration name: (type_identifier) @name)',
    },
    {
        kind: 'variable',
        languages: ['typescript', 'javascript', 'tsx', 'jsx'],
        // 匹配变量声明: const foo = ...
        pattern: '(lexical_declaration (variable_declarator name: (identifier) @name))',
    },
    // Rust 支持
    {
        kind: 'function',
        languages: ['rust'],
        // 匹配 Rust 函数: fn foo() {}
        pattern: '(function_item name: (identifier) @name)',
    },
    {
        kind: 'class',
        languages: ['rust'],
        // 匹配 Rust struct: struct Foo {}
        pattern: '(struct_item name: (type_identifier) @name)',
    },
    {
        kind: 'interface',
        languages: ['rust'],
        // 匹配 Rust trait: trait Foo {}
        pattern: '(trait_item name: (type_identifier) @name)',
    },
    {
        kind: 'type',
        languages: ['rust'],
        // 匹配 Rust type alias: type Foo = ...
        pattern: '(type_item name: (type_identifier) @name)',
    },
];
export class SymbolService {
    /**
     * 发现代码库中的符号定义
     * 使用 AST-grep 进行结构化符号提取
     */
    async discoverSymbols(options) {
        const { rootDir, include, ignore, limit = 100, signal } = options;
        // 验证 Core 是否已初始化
        if (!isReady()) {
            throw new Error('Core is not ready');
        }
        // 验证 limit 参数
        const effectiveLimit = Math.min(Math.max(1, limit), 1000);
        // 检查取消信号
        if (signal.aborted) {
            throw new Error('Operation aborted');
        }
        // 使用 discoverFiles 获取文件列表
        const files = await discoverFiles({ rootDir, include, ignore });
        // 检查取消信号
        if (signal.aborted) {
            throw new Error('Operation aborted');
        }
        const symbols = [];
        let truncated = false;
        let totalScannedFiles = 0;
        // 遍历文件提取符号
        let truncatedFileSymbols = []; // 记录被截断文件的剩余符号
        for (const file of files) {
            if (signal.aborted) {
                throw new Error('Operation aborted');
            }
            totalScannedFiles++;
            // 使用 AST 解析提取符号
            const fileSymbols = await this.extractSymbolsFromFileAST(file);
            for (const symbol of fileSymbols) {
                if (symbols.length >= effectiveLimit) {
                    truncated = true;
                    truncatedFileSymbols.push(symbol); // 记录被截断后剩余的符号
                }
                else {
                    symbols.push(symbol);
                }
            }
            if (truncated)
                break;
        }
        // 真实总数统计：当前已收集 + 当前文件剩余 + 后续文件
        let total = symbols.length;
        if (truncated) {
            total += truncatedFileSymbols.length; // 加上当前文件被截断的剩余符号
            // 继续扫描后续文件
            for (let i = totalScannedFiles; i < files.length; i++) {
                if (signal.aborted)
                    break;
                const file = files[i];
                const fileSymbols = await this.extractSymbolsFromFileAST(file);
                total += fileSymbols.length;
            }
        }
        return {
            symbols,
            total,
            truncated
        };
    }
    /**
     * 从单个文件使用 AST 提取符号
     * 使用 @ast-grep/napi 进行结构化解析
     */
    async extractSymbolsFromFileAST(file) {
        const symbols = [];
        // 获取文件语言
        const language = languageFromFilePath(file);
        if (!language) {
            return symbols; // 不支持的文件类型
        }
        try {
            // 使用 core 的 parse-cache 解析文件
            const { root } = await defaultParseCache.parseFile(file, language, { cacheAst: true });
            // 应用符号发现规则
            for (const rule of SYMBOL_RULES) {
                // 跳过不匹配当前语言的规则（语言值归一化为小写比较）
                if (!rule.languages.includes(String(language).toLowerCase())) {
                    continue;
                }
                // 查找所有匹配的节点
                const nodes = root.findAll({ rule: rule.pattern });
                for (const node of nodes) {
                    // 提取符号名称
                    const nameNode = node.getMatch('name');
                    if (!nameNode)
                        continue;
                    const name = nameNode.text();
                    if (!name)
                        continue;
                    // 获取位置信息
                    const range = node.range();
                    symbols.push({
                        name,
                        kind: rule.kind,
                        file,
                        range: {
                            start: {
                                line: range.start.line,
                                column: range.start.column,
                                index: range.start.index
                            },
                            end: {
                                line: range.end.line,
                                column: range.end.column,
                                index: range.end.index
                            }
                        }
                    });
                }
            }
        }
        catch (error) {
            // 解析失败则跳过该文件
            console.warn(`Failed to parse file ${file}:`, error);
        }
        return symbols;
    }
}
// 导出单例实例
export const symbolService = new SymbolService();
//# sourceMappingURL=symbol-service.js.map