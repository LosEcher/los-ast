import { scanNativeInputProperties, scanScopeSchema, } from './scan-contract.js';
export { scanResponseSchema } from './scan-contract.js';
export function buildScanRequestBodySchema(builtInRulePackNames) {
    return {
        type: 'object',
        required: ['project'],
        properties: {
            scope: scanScopeSchema,
            project: { type: 'string', minLength: 1 },
            rootDir: { type: 'string', minLength: 1 },
            include: { type: 'array', items: { type: 'string' } },
            ignore: { type: 'array', items: { type: 'string' } },
            rules: { type: 'array', items: { type: 'string' } },
            rulePack: {
                type: 'string',
                enum: builtInRulePackNames,
                description: `内置治理规则包。当前支持 ${builtInRulePackNames.join(', ')}。`,
            },
            includeStats: { type: 'boolean' },
            deterministic: { type: 'boolean' },
            ...scanNativeInputProperties,
        },
    };
}
