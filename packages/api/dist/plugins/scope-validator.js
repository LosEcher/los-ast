import fp from 'fastify-plugin';
import { ScopeError, ValidationError } from '../types/errors.js';
import { SCOPE_CONFIG } from '../config/index.js';
/**
 * Scope 验证插件
 * 硬约束 #3: 验证 scope 的完整性和环境适配性
 */
export default fp(async function scopeValidatorPlugin(fastify) {
    // 注册 preHandler hook 进行 scope 验证
    // 注意：使用 preHandler 而不是 onRequest，因为 onRequest 在 body 解析之前运行
    fastify.addHook('preHandler', async (request) => {
        // 只验证 API 路由，跳过健康检查
        if (request.url.startsWith('/healthz')) {
            return;
        }
        // 尝试从请求体或查询参数中获取 scope
        const scope = extractScope(request);
        // 如果没有 scope，返回 400
        if (!scope) {
            throw new ValidationError('MISSING_SCOPE', 'Scope is required in request body or query parameters');
        }
        // 生产环境强制完整 scope
        if (SCOPE_CONFIG.requireFullScope) {
            // 检查完整 scope (tenant_id, project_id, actor_id)
            if (!scope.tenant_id || !scope.project_id || !scope.actor_id) {
                const missing = [];
                if (!scope.tenant_id)
                    missing.push('tenant_id');
                if (!scope.project_id)
                    missing.push('project_id');
                if (!scope.actor_id)
                    missing.push('actor_id');
                throw new ScopeError('INCOMPLETE_SCOPE', `Incomplete scope in production environment. Missing: ${missing.join(', ')}`);
            }
            // 生产环境拒绝 local mode
            if (scope.mode === 'local') {
                throw new ScopeError('LOCAL_SCOPE_FORBIDDEN', 'Mode "local" is not allowed in production environment');
            }
        }
        // 将验证后的 scope 附加到 request context，供后续使用
        request.scope = scope;
    });
}, {
    name: 'scope-validator',
    fastify: '5.x',
});
/**
 * 从请求中提取 scope
 * 优先从 body 获取，其次从 query 参数
 */
function extractScope(request) {
    // 尝试从 body 获取 (POST/PUT 请求)
    if (request.body && typeof request.body === 'object') {
        const body = request.body;
        if (body.scope && typeof body.scope === 'object') {
            return body.scope;
        }
    }
    // 尝试从 query 参数获取 (GET 请求)
    if (request.query && typeof request.query === 'object') {
        const query = request.query;
        if (query.scope) {
            if (typeof query.scope === 'string') {
                try {
                    return JSON.parse(query.scope);
                }
                catch {
                    return null;
                }
            }
            if (typeof query.scope === 'object') {
                return query.scope;
            }
        }
    }
    return null;
}
//# sourceMappingURL=scope-validator.js.map