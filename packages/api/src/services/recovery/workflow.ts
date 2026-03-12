import type { ExecuteRecoveryActionRequest, RecoveryAction } from '@los-ast/shared/types';

import { NotFoundError, ValidationError } from '../../types/errors.js';
import {
  createRecoveryAction,
  executeL1Action,
  executeL2Action,
  getRecoveryAction,
  getRecoveryActionWithScope,
  startRecoveryAction,
  updateRecoveryActionStatus,
} from './store.js';

export interface RecoveryScope {
  tenant_id: string;
  project_id: string;
}

export async function createRecoveryActionWorkflow(input: {
  request: ExecuteRecoveryActionRequest;
  scope: RecoveryScope;
  actorId?: string;
}): Promise<{ action: RecoveryAction | null; message: string }> {
  const action = await createRecoveryAction({
    ...input.request,
    actor_id: input.actorId || input.request.actor_id,
  }, input.scope);

  if (!action.safety.requires_approval) {
    const finalAction = await executeApprovedRecoveryAction(action.action_id);
    return {
      action: finalAction,
      message: 'Recovery action executed',
    };
  }

  return {
    action,
    message: 'Recovery action pending approval',
  };
}

export async function approveRecoveryActionWorkflow(
  actionId: string,
  scope: RecoveryScope
): Promise<RecoveryAction | null> {
  const action = await requireScopedRecoveryAction(actionId, scope);

  if (action.status !== 'pending_approval') {
    throw new ValidationError('INVALID_STATUS', 'Action is not pending approval');
  }

  await approveLinkedRecoveryAction(actionId, scope);
  return executeApprovedRecoveryAction(actionId);
}

export async function rejectLinkedRecoveryAction(
  actionId: string,
  actorId: string,
  comment: string | undefined,
  scope: RecoveryScope
): Promise<RecoveryAction | null> {
  await requireScopedRecoveryAction(actionId, scope);
  return updateRecoveryActionStatus(actionId, 'failed', {
    success: false,
    error: `Approval rejected by ${actorId}${comment ? `: ${comment}` : ''}`,
    duration_ms: 0,
  });
}

export async function approveLinkedRecoveryAction(
  actionId: string,
  scope: RecoveryScope
): Promise<RecoveryAction | null> {
  await requireScopedRecoveryAction(actionId, scope);
  return updateRecoveryActionStatus(actionId, 'approved');
}

export async function rollbackRecoveryActionWorkflow(input: {
  actionId: string;
  scope: RecoveryScope;
  actorId?: string;
  reason: string;
}): Promise<RecoveryAction | null> {
  const action = await requireScopedRecoveryAction(input.actionId, input.scope);

  if (action.status === 'pending_approval' || action.status === 'rolled_back') {
    throw new ValidationError('INVALID_STATUS', `Action cannot be rolled back from status ${action.status}`);
  }

  return updateRecoveryActionStatus(input.actionId, 'rolled_back', {
    success: true,
    output: `Rolled back by ${input.actorId || 'unknown'}: ${input.reason}`,
    duration_ms: 0,
  });
}

export async function executeApprovedRecoveryAction(actionId: string): Promise<RecoveryAction | null> {
  const startedAction = await startRecoveryAction(actionId);
  if (!startedAction) {
    throw new NotFoundError('Recovery action', actionId);
  }

  if (startedAction.level === 'L1_harmless') {
    const result = await executeL1Action(startedAction);
    await updateRecoveryActionStatus(startedAction.action_id, result.success ? 'succeeded' : 'failed', result);
  } else if (startedAction.level === 'L2_controlled') {
    const result = await executeL2Action(startedAction);
    await updateRecoveryActionStatus(startedAction.action_id, result.success ? 'succeeded' : 'failed', result);
  }

  return getRecoveryAction(actionId);
}

async function requireScopedRecoveryAction(
  actionId: string,
  scope: RecoveryScope
): Promise<RecoveryAction> {
  const action = await getRecoveryActionWithScope(actionId, scope.tenant_id, scope.project_id);
  if (!action) {
    throw new NotFoundError('Recovery action', actionId);
  }

  return action;
}
