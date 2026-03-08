/**
 * los-memory 存储服务
 * Phase 1.2: 经验沉淀存储
 *
 * 存储和管理经验沉淀数据
 */
import type { Proposal, IncidentLesson, RecoveryRecipe, CreateProposalRequest, KnowledgeQuery, KnowledgeResponse, MemoryStats } from '@los-ast/shared/types';
/**
 * 创建提案
 */
export declare function createProposal(request: CreateProposalRequest): Promise<Proposal>;
/**
 * 获取提案
 */
export declare function getProposal(proposalId: string): Promise<Proposal | null>;
/**
 * 获取提案（带 scope 校验）
 * 返回 null 如果提案不存在或 scope 不匹配
 */
export declare function getProposalWithScope(proposalId: string, tenant_id: string, project_id: string): Promise<Proposal | null>;
/**
 * 验证提案
 */
export declare function validateProposal(proposalId: string, validatorId: string, approve: boolean, rejectionReason?: string): Promise<Proposal | null>;
/**
 * 查询知识库
 */
export declare function queryKnowledge(query: KnowledgeQuery): Promise<KnowledgeResponse>;
/**
 * 获取恢复方案
 */
export declare function getRecoveryRecipe(recipeId: string): Promise<RecoveryRecipe | null>;
/**
 * 获取恢复方案（带 scope 校验）
 * 返回 null 如果方案不存在或 scope 不匹配
 */
export declare function getRecoveryRecipeWithScope(recipeId: string, tenant_id: string, project_id: string): Promise<RecoveryRecipe | null>;
/**
 * 查找匹配的恢复方案
 */
export declare function findMatchingRecipes(tenantId: string, projectId: string, keywords: string[]): Promise<RecoveryRecipe[]>;
/**
 * 更新方案使用统计
 */
export declare function updateRecipeStats(recipeId: string, success: boolean, durationSeconds: number): Promise<void>;
/**
 * 获取事件教训
 */
export declare function getIncidentLesson(lessonId: string): Promise<IncidentLesson | null>;
/**
 * 获取事件教训（带 scope 校验）
 * 返回 null 如果教训不存在或 scope 不匹配
 */
export declare function getIncidentLessonWithScope(lessonId: string, tenant_id: string, project_id: string): Promise<IncidentLesson | null>;
/**
 * 获取统计信息（按 scope 过滤）
 */
export declare function getMemoryStats(tenant_id?: string, project_id?: string): Promise<MemoryStats>;
/**
 * 清空存储 (用于测试)
 */
export declare function clearMemoryStore(): void;
//# sourceMappingURL=store.d.ts.map