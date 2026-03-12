import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import errorHandlerPlugin from '../../src/plugins/error-handler';
import requestIdPlugin from '../../src/plugins/request-id';
import scopeValidatorPlugin from '../../src/plugins/scope-validator';
import healthCheckPlugin from '../../src/plugins/health-check';
import vpsAgentWebRoutes from '../../src/routes/vps-agent-web/index';
import { clearStore as clearIncidentStore } from '../../src/services/incident/store';
import { clearCollectionStore } from '../../src/services/incident/collection';
import { clearRecoveryStore } from '../../src/services/recovery/store';
import { clearAttributionStore } from '../../src/services/attribution/store';
import { clearApprovalStore } from '../../src/services/approval/store';

describe('VPS Agent Web Routes', () => {
  it('should return 404 when routes are not registered', async () => {
    const app = Fastify({ logger: false });
    await app.register(requestIdPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(healthCheckPlugin);
    await app.register(scopeValidatorPlugin);
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/vps-agent-web/approvals/stats?scope=%7B%22tenant_id%22%3A%22t1%22%2C%22project_id%22%3A%22p1%22%7D',
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  describe('registered routes', () => {
    let app: FastifyInstance;
    const scope = { tenant_id: 'tenant-vps', project_id: 'project-vps' };

    beforeAll(async () => {
      app = Fastify({ logger: false });
      await app.register(requestIdPlugin);
      await app.register(errorHandlerPlugin);
      await app.register(healthCheckPlugin);
      await app.register(scopeValidatorPlugin);
      await app.register(vpsAgentWebRoutes, { prefix: '/vps-agent-web' });
      await app.ready();
    });

    beforeEach(() => {
      clearIncidentStore();
      clearCollectionStore();
      clearRecoveryStore();
      clearAttributionStore();
      clearApprovalStore();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should expose approval stats endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/approvals/stats?scope=${encodeURIComponent(JSON.stringify(scope))}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.stats).toBeDefined();
    });

    it('should expose incident stats endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/incidents/stats/store?scope=${encodeURIComponent(JSON.stringify(scope))}`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject empty attribution analyze payloads at the request boundary', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/attribution/analyze',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject malformed attribution analyze payloads at runtime schema boundary', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/attribution/analyze',
        payload: {
          scope,
          incident_id: 'inc_test',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject malformed recovery action payloads at runtime schema boundary', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/recovery/actions',
        payload: {
          scope,
          incident_id: 'inc_test',
          level: 'L1_harmless',
          type: 'restart',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject malformed approval payloads at runtime schema boundary', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/approvals',
        payload: {
          scope: {
            ...scope,
            actor_id: 'actor-a',
          },
          item_type: 'recovery_action',
          item_id: 'act_123',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject malformed incident payloads at runtime schema boundary', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/incidents',
        payload: {
          scope: {
            ...scope,
            actor_id: 'actor-a',
          },
          title: 'Incomplete incident',
          severity: 'high',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should isolate preview stats by scope across incidents recovery attribution', async () => {
      const scopeA = {
        tenant_id: 'tenant-vps-a',
        project_id: 'project-vps-a',
        actor_id: 'actor-a',
      };
      const scopeB = {
        tenant_id: 'tenant-vps-b',
        project_id: 'project-vps-b',
        actor_id: 'actor-b',
      };

      const beforeAResp = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/incidents/stats/store?scope=${encodeURIComponent(JSON.stringify(scopeA))}`,
      });
      const beforeBResp = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/incidents/stats/store?scope=${encodeURIComponent(JSON.stringify(scopeB))}`,
      });
      const beforeA = JSON.parse(beforeAResp.body).count;
      const beforeB = JSON.parse(beforeBResp.body).count;

      const createIncidentA = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/incidents',
        payload: {
          scope: scopeA,
          title: 'A incident',
          description: 'Scope A incident',
          severity: 'high',
          source: { type: 'metric_alert', detector_id: 'detector-a', raw_payload: { rule_id: 'rule-a' } },
        },
      });
      const createIncidentB = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/incidents',
        payload: {
          scope: scopeB,
          title: 'B incident',
          description: 'Scope B incident',
          severity: 'high',
          source: { type: 'metric_alert', detector_id: 'detector-b', raw_payload: { rule_id: 'rule-b' } },
        },
      });

      expect(createIncidentA.statusCode).toBe(201);
      expect(createIncidentB.statusCode).toBe(201);
      const incidentAId = JSON.parse(createIncidentA.body).incident.incident_id;
      const incidentBId = JSON.parse(createIncidentB.body).incident.incident_id;

      await app.inject({
        method: 'POST',
        url: '/vps-agent-web/recovery/actions',
        payload: {
          scope: scopeA,
          incident_id: incidentAId,
          hypothesis_id: 'hyp-a',
          level: 'L1_harmless',
          type: 'restart',
          parameters: {},
          actor_id: 'actor-a',
        },
      });
      await app.inject({
        method: 'POST',
        url: '/vps-agent-web/recovery/actions',
        payload: {
          scope: scopeB,
          incident_id: incidentBId,
          hypothesis_id: 'hyp-b',
          level: 'L1_harmless',
          type: 'restart',
          parameters: {},
          actor_id: 'actor-b',
        },
      });

      const evidenceAResp = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/attribution/evidence',
        payload: {
          scope: scopeA,
          incident_id: incidentAId,
          evidence_types: ['log'],
          time_range: {
            from: '2026-03-12T00:00:00.000Z',
            to: '2026-03-12T01:00:00.000Z',
          },
        },
      });
      const evidenceBResp = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/attribution/evidence',
        payload: {
          scope: scopeB,
          incident_id: incidentBId,
          evidence_types: ['log'],
          time_range: {
            from: '2026-03-12T00:00:00.000Z',
            to: '2026-03-12T01:00:00.000Z',
          },
        },
      });

      const evidenceABundleId = JSON.parse(evidenceAResp.body).bundle.bundle_id;
      const evidenceBBundleId = JSON.parse(evidenceBResp.body).bundle.bundle_id;

      await app.inject({
        method: 'POST',
        url: '/vps-agent-web/attribution/analyze',
        payload: {
          scope: scopeA,
          incident_id: incidentAId,
          evidence_bundle_id: evidenceABundleId,
        },
      });
      await app.inject({
        method: 'POST',
        url: '/vps-agent-web/attribution/analyze',
        payload: {
          scope: scopeB,
          incident_id: incidentBId,
          evidence_bundle_id: evidenceBBundleId,
        },
      });

      const afterAResp = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/incidents/stats/store?scope=${encodeURIComponent(JSON.stringify(scopeA))}`,
      });
      const afterBResp = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/incidents/stats/store?scope=${encodeURIComponent(JSON.stringify(scopeB))}`,
      });
      const afterA = JSON.parse(afterAResp.body).count;
      const afterB = JSON.parse(afterBResp.body).count;
      expect(afterA).toBe(beforeA + 1);
      expect(afterB).toBe(beforeB + 1);

      const recoveryAResp = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/recovery/stats?scope=${encodeURIComponent(JSON.stringify(scopeA))}`,
      });
      const recoveryBResp = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/recovery/stats?scope=${encodeURIComponent(JSON.stringify(scopeB))}`,
      });
      expect(JSON.parse(recoveryAResp.body).stats.total_actions).toBeGreaterThanOrEqual(1);
      expect(JSON.parse(recoveryBResp.body).stats.total_actions).toBeGreaterThanOrEqual(1);

      const attributionAResp = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/attribution/stats?scope=${encodeURIComponent(JSON.stringify(scopeA))}`,
      });
      const attributionBResp = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/attribution/stats?scope=${encodeURIComponent(JSON.stringify(scopeB))}`,
      });
      expect(JSON.parse(attributionAResp.body).stats.total_analyses).toBeGreaterThanOrEqual(1);
      expect(JSON.parse(attributionBResp.body).stats.total_analyses).toBeGreaterThanOrEqual(1);
    });

    it('should ignore forged tenant/project query params when listing incidents', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/incidents',
        payload: {
          scope: {
            tenant_id: 'tenant-real',
            project_id: 'project-real',
            actor_id: 'actor-real',
          },
          title: 'Scoped incident',
          description: 'Should stay in real scope',
          severity: 'medium',
          source: { type: 'metric_alert', detector_id: 'detector-real', raw_payload: {} },
        },
      });

      expect(createResponse.statusCode).toBe(201);

      const listResponse = await app.inject({
        method: 'GET',
        url: '/vps-agent-web/incidents?tenant_id=tenant-forged&project_id=project-forged&scope=' +
          encodeURIComponent(JSON.stringify({
            tenant_id: 'tenant-real',
            project_id: 'project-real',
            actor_id: 'actor-real',
          })),
      });

      expect(listResponse.statusCode).toBe(200);
      const body = JSON.parse(listResponse.body);
      expect(body.total).toBe(1);
      expect(body.items[0].scope.tenant_id).toBe('tenant-real');
      expect(body.items[0].scope.project_id).toBe('project-real');
    });

    it('should return 404 when reading recovery action from another scope', async () => {
      const scopeA = {
        tenant_id: 'tenant-recovery-a',
        project_id: 'project-recovery-a',
        actor_id: 'actor-a',
      };
      const scopeB = {
        tenant_id: 'tenant-recovery-b',
        project_id: 'project-recovery-b',
        actor_id: 'actor-b',
      };

      const incidentResponse = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/incidents',
        payload: {
          scope: scopeA,
          title: 'Recovery incident',
          description: 'Owned by scope A',
          severity: 'high',
          source: { type: 'metric_alert', detector_id: 'detector-a', raw_payload: {} },
        },
      });

      const incidentId = JSON.parse(incidentResponse.body).incident.incident_id;
      const actionResponse = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/recovery/actions',
        payload: {
          scope: scopeA,
          incident_id: incidentId,
          hypothesis_id: 'hyp-a',
          level: 'L1_harmless',
          type: 'restart',
          parameters: {},
          actor_id: 'forged-actor',
        },
      });

      expect(actionResponse.statusCode).toBe(201);
      const actionId = JSON.parse(actionResponse.body).action.action_id;

      const crossScope = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/recovery/actions/${actionId}?scope=${encodeURIComponent(JSON.stringify(scopeB))}`,
      });

      expect(crossScope.statusCode).toBe(404);
    });

    it('should attach created recovery actions back onto the incident record', async () => {
      const scope = {
        tenant_id: 'tenant-recovery-link',
        project_id: 'project-recovery-link',
        actor_id: 'actor-link',
      };

      const incidentResponse = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/incidents',
        payload: {
          scope,
          title: 'Linked recovery incident',
          description: 'Incident should receive recovery action linkage',
          severity: 'high',
          source: { type: 'metric_alert', detector_id: 'detector-link', raw_payload: {} },
        },
      });

      expect(incidentResponse.statusCode).toBe(201);
      const incidentId = JSON.parse(incidentResponse.body).incident.incident_id;

      const actionResponse = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/recovery/actions',
        payload: {
          scope,
          incident_id: incidentId,
          hypothesis_id: 'hyp-link',
          level: 'L1_harmless',
          type: 'restart',
          parameters: {},
        },
      });

      expect(actionResponse.statusCode).toBe(201);
      const actionId = JSON.parse(actionResponse.body).action.action_id;

      const incidentReadResponse = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/incidents/${incidentId}?scope=${encodeURIComponent(JSON.stringify(scope))}`,
      });

      expect(incidentReadResponse.statusCode).toBe(200);
      const incidentBody = JSON.parse(incidentReadResponse.body);
      expect(incidentBody.incident.recovery_actions).toContain(actionId);
    });

    it('should drive recovery execution when a linked approval is approved', async () => {
      const scope = {
        tenant_id: 'tenant-recovery-approval',
        project_id: 'project-recovery-approval',
        actor_id: 'actor-approval',
      };

      const incidentResponse = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/incidents',
        payload: {
          scope,
          title: 'Approval-linked recovery incident',
          description: 'Approval should advance recovery action state',
          severity: 'high',
          source: { type: 'metric_alert', detector_id: 'detector-approval', raw_payload: {} },
        },
      });

      expect(incidentResponse.statusCode).toBe(201);
      const incidentId = JSON.parse(incidentResponse.body).incident.incident_id;

      const actionResponse = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/recovery/actions',
        payload: {
          scope,
          incident_id: incidentId,
          hypothesis_id: 'hyp-approval',
          level: 'L1_harmless',
          type: 'restart',
          parameters: {},
        },
      });

      expect(actionResponse.statusCode).toBe(201);
      const actionBody = JSON.parse(actionResponse.body);
      const actionId = actionBody.action.action_id;
      expect(actionBody.action.status).toBe('pending_approval');

      const approvalResponse = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/approvals',
        payload: {
          scope,
          item_type: 'recovery_action',
          item_id: actionId,
          title: 'Approve recovery action',
          description: 'Linked recovery action approval',
          risk_level: 'medium',
          timeout_seconds: 60,
        },
      });

      expect(approvalResponse.statusCode).toBe(201);
      const approvalId = JSON.parse(approvalResponse.body).approval.approval_id;

      const processResponse = await app.inject({
        method: 'POST',
        url: `/vps-agent-web/approvals/${approvalId}/process`,
        payload: {
          scope,
          action: 'approve',
          comment: 'Ship it',
        },
      });

      expect(processResponse.statusCode).toBe(200);

      const actionReadResponse = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/recovery/actions/${actionId}?scope=${encodeURIComponent(JSON.stringify(scope))}`,
      });

      expect(actionReadResponse.statusCode).toBe(200);
      const updatedAction = JSON.parse(actionReadResponse.body).action;
      expect(['succeeded', 'failed']).toContain(updatedAction.status);
    });

    it('should return 404 when reading attribution evidence from another scope', async () => {
      const scopeA = {
        tenant_id: 'tenant-attr-a',
        project_id: 'project-attr-a',
        actor_id: 'actor-a',
      };
      const scopeB = {
        tenant_id: 'tenant-attr-b',
        project_id: 'project-attr-b',
        actor_id: 'actor-b',
      };

      const incidentResponse = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/incidents',
        payload: {
          scope: scopeA,
          title: 'Attribution incident',
          description: 'Owned by scope A',
          severity: 'high',
          source: { type: 'metric_alert', detector_id: 'detector-a', raw_payload: {} },
        },
      });
      const incidentId = JSON.parse(incidentResponse.body).incident.incident_id;

      const evidenceResponse = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/attribution/evidence',
        payload: {
          scope: scopeA,
          incident_id: incidentId,
          evidence_types: ['log'],
          time_range: {
            from: '2026-03-12T00:00:00.000Z',
            to: '2026-03-12T01:00:00.000Z',
          },
        },
      });

      expect(evidenceResponse.statusCode).toBe(201);
      const bundleId = JSON.parse(evidenceResponse.body).bundle.bundle_id;

      const crossScope = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/attribution/evidence/${bundleId}?scope=${encodeURIComponent(JSON.stringify(scopeB))}`,
      });

      expect(crossScope.statusCode).toBe(404);
    });
  });
});
