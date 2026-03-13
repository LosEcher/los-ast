import { PERSISTENCE_CONFIG } from '../../config/index.js';
import { runInSqliteTransaction } from '../../persistence/sqlite-database.js';
import { NotFoundError } from '../../types/errors.js';
import { processApproval } from './store.js';
import { approveLinkedRecoveryAction, executeApprovedRecoveryAction, rejectLinkedRecoveryAction, } from '../recovery/workflow.js';
import { getRecoveryActionWithScope } from '../recovery/store.js';
export async function processApprovalWorkflow(input) {
    const linkedRecoveryAction = await resolveLinkedRecoveryAction(input.approval, input.scope);
    const processedApproval = await runApprovalMutation(async () => {
        const processed = await processApproval(input.approval.approval_id, {
            ...input.request,
            actor_id: input.actorId,
        });
        if (linkedRecoveryAction) {
            if (input.request.action === 'approve') {
                await approveLinkedRecoveryAction(linkedRecoveryAction.action_id, input.scope);
            }
            else {
                await rejectLinkedRecoveryAction(linkedRecoveryAction.action_id, input.actorId, input.request.comment, input.scope);
            }
        }
        return processed;
    });
    if (linkedRecoveryAction &&
        input.request.action === 'approve' &&
        (linkedRecoveryAction.level === 'L1_harmless' || linkedRecoveryAction.level === 'L2_controlled')) {
        await executeApprovedRecoveryAction(linkedRecoveryAction.action_id);
    }
    return processedApproval;
}
async function resolveLinkedRecoveryAction(approval, scope) {
    if (approval.item_type !== 'recovery_action') {
        return null;
    }
    const linkedRecoveryAction = await getRecoveryActionWithScope(approval.item_id, scope.tenant_id, scope.project_id);
    if (!linkedRecoveryAction) {
        throw new NotFoundError('Recovery action', approval.item_id);
    }
    return linkedRecoveryAction;
}
async function runApprovalMutation(callback) {
    if (PERSISTENCE_CONFIG.experimentalStoreBackend !== 'sqlite') {
        return callback();
    }
    return runInSqliteTransaction(async () => callback());
}
