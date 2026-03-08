/**
 * los-ast 证据生成服务
 * Phase 1.7: los-ast 证据生成
 */
import type { CodeEvidenceBundle, GenerateEvidenceRequest, ValidatePatchSafetyRequest, ValidatePatchSafetyResponse, GenerateRewriteRequest, GenerateRewriteResponse, ExplainCodeRequest, ExplainCodeResponse, CodeStats } from '@los-ast/shared/types';
/**
 * 生成证据包
 */
export declare function generateEvidence(request: GenerateEvidenceRequest): Promise<CodeEvidenceBundle>;
/**
 * 验证 Patch 安全性
 */
export declare function validatePatchSafety(request: ValidatePatchSafetyRequest): Promise<ValidatePatchSafetyResponse>;
/**
 * 生成改写候选
 */
export declare function generateRewrite(request: GenerateRewriteRequest): Promise<GenerateRewriteResponse>;
/**
 * 解释代码
 */
export declare function explainCode(request: ExplainCodeRequest): Promise<ExplainCodeResponse>;
/**
 * 获取证据包
 */
export declare function getEvidenceBundle(bundleId: string): Promise<CodeEvidenceBundle | null>;
/**
 * 获取代码统计
 */
export declare function getCodeStats(_project: string): Promise<CodeStats>;
/**
 * 清空存储 (用于测试)
 */
export declare function clearEvidenceStore(): void;
//# sourceMappingURL=service.d.ts.map