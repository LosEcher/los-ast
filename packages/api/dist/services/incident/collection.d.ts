/**
 * 数据采集服务
 * Phase 1.1: Incident 数据模型与采集系统
 *
 * 处理指标和日志数据的采集、存储和触发器评估
 */
import type { MetricDataPoint, LogEntry, Trigger, TriggerEvaluation, MetricSnapshot, IncidentScope } from '@los-ast/shared/types';
/**
 * 采集指标数据
 */
export declare function collectMetrics(scope: IncidentScope, metrics: MetricDataPoint[]): Promise<void>;
/**
 * 采集日志数据
 */
export declare function collectLogs(scope: IncidentScope, logs: LogEntry[]): Promise<void>;
/**
 * 获取指标数据
 */
export declare function getMetrics(scope: IncidentScope, metricName?: string, from?: string, to?: string): Promise<MetricDataPoint[]>;
/**
 * 获取日志数据
 */
export declare function getLogs(scope: IncidentScope, level?: string, service?: string, from?: string, to?: string): Promise<LogEntry[]>;
/**
 * 注册触发器
 */
export declare function registerTrigger(trigger: Trigger): Promise<void>;
/**
 * 获取触发器
 */
export declare function getTrigger(triggerId: string): Promise<Trigger | null>;
/**
 * 列出所有触发器
 */
export declare function listTriggers(): Promise<Trigger[]>;
/**
 * 删除触发器
 */
export declare function deleteTrigger(triggerId: string): Promise<boolean>;
/**
 * 评估触发器
 */
export declare function evaluateTriggers(scope: IncidentScope, metrics: MetricDataPoint[]): Promise<TriggerEvaluation[]>;
/**
 * 匹配日志模式
 */
export declare function matchLogPatterns(scope: IncidentScope, pattern: string): Promise<LogEntry[]>;
/**
 * 获取指标快照
 */
export declare function getMetricSnapshot(scope: IncidentScope): Promise<MetricSnapshot>;
/**
 * 清空存储 (用于测试)
 */
export declare function clearCollectionStore(): void;
/**
 * 获取存储统计
 */
export declare function getCollectionStats(): {
    metricsCount: number;
    logsCount: number;
    triggersCount: number;
};
export declare function getCollectionStatsByScope(scope: {
    tenant_id?: string;
    project_id?: string;
}): {
    metricsCount: number;
    logsCount: number;
    triggersCount: number;
};
//# sourceMappingURL=collection.d.ts.map