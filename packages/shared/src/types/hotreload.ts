/**
 * 热重载系统类型定义
 * Phase 1.6: 热重载系统
 */

export type ConfigBundleStatus = 'draft' | 'validated' | 'active' | 'rollback' | 'archived';

export interface ConfigBundle {
  bundle_id: string;
  version: string;
  target_scope: {
    tenants?: string[];
    projects?: string[];
    percentage?: number;
  };
  configs: {
    detectors?: DetectorConfig[];
    recovery_policies?: RecoveryPolicyConfig[];
    recipes?: string[];
    thresholds?: ThresholdConfig[];
  };
  status: ConfigBundleStatus;
  validation: {
    checksum: string;
    validated_by: string[];
  };
  created_at: string;
  updated_at: string;
}

export interface DetectorConfig {
  detector_id: string;
  name: string;
  type: 'metric' | 'log' | 'composite';
  enabled: boolean;
  parameters: Record<string, unknown>;
}

export interface RecoveryPolicyConfig {
  policy_id: string;
  level: 'L1' | 'L2' | 'L3';
  auto_execute: boolean;
  cooldown_seconds: number;
}

export interface ThresholdConfig {
  threshold_id: string;
  metric_name: string;
  warning: number;
  critical: number;
}

export interface CreateConfigBundleRequest {
  version: string;
  target_scope: {
    tenants?: string[];
    projects?: string[];
    percentage?: number;
  };
  configs: ConfigBundle['configs'];
}

export interface ValidateConfigBundleRequest {
  validator_id: string;
}

export interface ActivateConfigBundleRequest {
  strategy: 'immediate' | 'canary' | 'gradual';
  canary_percentage?: number;
}

export interface HotReloadStats {
  total_bundles: number;
  active_bundles: number;
  by_status: Record<ConfigBundleStatus, number>;
}
