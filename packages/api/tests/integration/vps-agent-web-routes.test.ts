import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import errorHandlerPlugin from '../../src/plugins/error-handler';
import requestIdPlugin from '../../src/plugins/request-id';
import scopeValidatorPlugin from '../../src/plugins/scope-validator';
import healthCheckPlugin from '../../src/plugins/health-check';
import vpsAgentWebRoutes from '../../src/routes/vps-agent-web/index';

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

    it('should enforce scope validation on attribution endpoint', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/attribution/analyze',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('MISSING_SCOPE');
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

      await app.inject({
        method: 'POST',
        url: '/vps-agent-web/attribution/analyze',
        payload: {
          scope: scopeA,
          incident_id: incidentAId,
          evidence_bundle_id: 'evd-a',
        },
      });
      await app.inject({
        method: 'POST',
        url: '/vps-agent-web/attribution/analyze',
        payload: {
          scope: scopeB,
          incident_id: incidentBId,
          evidence_bundle_id: 'evd-b',
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
      expect(JSON.parse(recoveryAResp.body).stats.totalActions).toBeGreaterThanOrEqual(1);
      expect(JSON.parse(recoveryBResp.body).stats.totalActions).toBeGreaterThanOrEqual(1);

      const attributionAResp = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/attribution/stats?scope=${encodeURIComponent(JSON.stringify(scopeA))}`,
      });
      const attributionBResp = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/attribution/stats?scope=${encodeURIComponent(JSON.stringify(scopeB))}`,
      });
      expect(JSON.parse(attributionAResp.body).stats.analysesCount).toBeGreaterThanOrEqual(1);
      expect(JSON.parse(attributionBResp.body).stats.analysesCount).toBeGreaterThanOrEqual(1);
    });
  });
});
