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
 * 获取统计信息
 */
export declare function getMemoryStats(): Promise<MemoryStats>;
/**
 * 清空存储 (用于测试)
 */
export declare function clearMemoryStore(): void;
//# sourceMappingURL=store.d.ts.map