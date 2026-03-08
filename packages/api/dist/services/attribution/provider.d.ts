import type { AttributionAnalysis, Scope } from '@los-ast/shared/types';
interface AnalyzeAttributionInput {
    incidentId: string;
    evidenceBundleId: string;
    scope?: Scope;
}
export declare function analyzeAttribution(input: AnalyzeAttributionInput): Promise<AttributionAnalysis>;
export {};
//# sourceMappingURL=provider.d.ts.map