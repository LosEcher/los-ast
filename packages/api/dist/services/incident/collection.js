/**
 * 数据采集服务
 * Phase 1.1: Incident 数据模型与采集系统
 *
 * 处理指标和日志数据的采集、存储和触发器评估
 */
// 内存存储 - 后续迁移到时序数据库
const metricsStore = new Map();
const logsStore = new Map();
const triggersStore = new Map();
// 触发器冷却状态
const triggerCooldowns = new Map();
/**
 * 采集指标数据
 */
export async function collectMetrics(scope, metrics) {
    const key = `${scope.tenant_id}:${scope.project_id}`;
    if (!metricsStore.has(key)) {
        metricsStore.set(key, []);
    }
    const stored = metricsStore.get(key);
    stored.push(...metrics);
    // 保留最近 1000 个数据点
    if (stored.length > 1000) {
        stored.splice(0, stored.length - 1000);
    }
    console.log(`[Collection] Collected ${metrics.length} metrics for ${key}`);
}
/**
 * 采集日志数据
 */
export async function collectLogs(scope, logs) {
    const key = `${scope.tenant_id}:${scope.project_id}`;
    if (!logsStore.has(key)) {
        logsStore.set(key, []);
    }
    const stored = logsStore.get(key);
    stored.push(...logs);
    // 保留最近 5000 条日志
    if (stored.length > 5000) {
        stored.splice(0, stored.length - 5000);
    }
    console.log(`[Collection] Collected ${logs.length} logs for ${key}`);
}
/**
 * 获取指标数据
 */
export async function getMetrics(scope, metricName, from, to) {
    const key = `${scope.tenant_id}:${scope.project_id}`;
    let metrics = metricsStore.get(key) || [];
    if (metricName) {
        metrics = metrics.filter((m) => m.metric_name === metricName);
    }
    if (from) {
        metrics = metrics.filter((m) => m.timestamp >= from);
    }
    if (to) {
        metrics = metrics.filter((m) => m.timestamp <= to);
    }
    return metrics;
}
/**
 * 获取日志数据
 */
export async function getLogs(scope, level, service, from, to) {
    const key = `${scope.tenant_id}:${scope.project_id}`;
    let logs = logsStore.get(key) || [];
    if (level) {
        logs = logs.filter((l) => l.level === level);
    }
    if (service) {
        logs = logs.filter((l) => l.service === service);
    }
    if (from) {
        logs = logs.filter((l) => l.timestamp >= from);
    }
    if (to) {
        logs = logs.filter((l) => l.timestamp <= to);
    }
    return logs;
}
/**
 * 注册触发器
 */
export async function registerTrigger(trigger) {
    triggersStore.set(trigger.trigger_id, trigger);
    console.log(`[Collection] Registered trigger ${trigger.trigger_id}: ${trigger.name}`);
}
/**
 * 获取触发器
 */
export async function getTrigger(triggerId) {
    return triggersStore.get(triggerId) || null;
}
/**
 * 列出所有触发器
 */
export async function listTriggers() {
    return Array.from(triggersStore.values());
}
/**
 * 删除触发器
 */
export async function deleteTrigger(triggerId) {
    return triggersStore.delete(triggerId);
}
/**
 * 评估触发器
 */
export async function evaluateTriggers(scope, metrics) {
    const results = [];
    const now = Date.now();
    for (const trigger of triggersStore.values()) {
        // 检查冷却期
        const cooldownKey = `${scope.tenant_id}:${scope.project_id}:${trigger.trigger_id}`;
        const lastTriggered = triggerCooldowns.get(cooldownKey) || 0;
        if (now - lastTriggered < trigger.cooldown_ms) {
            continue;
        }
        // 查找匹配的指标
        const matchedMetrics = metrics.filter((m) => m.metric_name === trigger.condition.metric_name);
        if (matchedMetrics.length === 0) {
            continue;
        }
        // 评估条件
        let triggered = false;
        let matchedValue = 0;
        for (const metric of matchedMetrics) {
            const value = metric.value;
            const threshold = trigger.condition.threshold;
            switch (trigger.condition.operator) {
                case 'gt':
                    triggered = value > threshold;
                    break;
                case 'lt':
                    triggered = value < threshold;
                    break;
                case 'eq':
                    triggered = value === threshold;
                    break;
                default:
                    triggered = false;
            }
            if (triggered) {
                matchedValue = value;
                break;
            }
        }
        if (triggered) {
            triggerCooldowns.set(cooldownKey, now);
            results.push({
                trigger_id: trigger.trigger_id,
                triggered: true,
                timestamp: new Date().toISOString(),
                matched_metrics: matchedMetrics,
                value: matchedValue,
            });
            console.log(`[Collection] Trigger ${trigger.trigger_id} fired with value ${matchedValue}`);
        }
    }
    return results;
}
/**
 * 匹配日志模式
 */
export async function matchLogPatterns(scope, pattern) {
    const logs = await getLogs(scope);
    const regex = new RegExp(pattern, 'i');
    return logs.filter((log) => regex.test(log.message));
}
/**
 * 获取指标快照
 */
export async function getMetricSnapshot(scope) {
    const metrics = await getMetrics(scope);
    return {
        timestamp: new Date().toISOString(),
        metrics,
    };
}
/**
 * 清空存储 (用于测试)
 */
export function clearCollectionStore() {
    metricsStore.clear();
    logsStore.clear();
    triggersStore.clear();
    triggerCooldowns.clear();
}
/**
 * 获取存储统计
 */
export function getCollectionStats() {
    let metricsCount = 0;
    for (const metrics of metricsStore.values()) {
        metricsCount += metrics.length;
    }
    let logsCount = 0;
    for (const logs of logsStore.values()) {
        logsCount += logs.length;
    }
    return {
        metricsCount,
        logsCount,
        triggersCount: triggersStore.size,
    };
}
//# sourceMappingURL=collection.js.map