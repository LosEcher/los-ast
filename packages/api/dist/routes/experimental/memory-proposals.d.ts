/**
 * los-memory API 路由 (实验性)
 * Phase 1.2: 经验提案 (candidate/proposal 语义，不直接决定入账)
 *
 * 注意: 此路由仅表达"提案/候选"，最终写入决策由 los-memory 或上层控制面决定
 * 避免侵蚀 los-memory sovereignty
 */
import type { FastifyInstance } from 'fastify';
/**
 * 注册 Memory Proposals 路由 (实验性)
 */
export default function memoryProposalsRoutes(fastify: FastifyInstance): Promise<void>;
//# sourceMappingURL=memory-proposals.d.ts.map