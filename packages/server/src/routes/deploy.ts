import path from 'node:path';
import fs from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import {
  buildDeployPackage,
  getBuildInfo,
  primaryPackagePath,
} from '../services/deployBuilder.js';
import { getTenant, tenantRoot as tenantRootDir } from '../services/tenantService.js';

export async function deployRoutes(fastify: FastifyInstance): Promise<void> {
  const builder = { preHandler: [fastify.requireBuilder] };

  // ── POST /api/tenants/:tenantId/deploy ─────────────────────────────────────
  // Triggers a build; waits for completion (may take ~30–60 s).
  fastify.post<{ Params: { tenantId: string } }>(
    '/:tenantId/deploy',
    builder,
    async (req, reply) => {
      const { tenantId } = req.params;
      const tenant = await getTenant(tenantId);
      if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

      try {
        const info = await buildDeployPackage(tenantId);
        return reply.send({ ok: true, ...info });
      } catch (err: unknown) {
        fastify.log.error(err, 'Deploy build failed');
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: `Build failed: ${msg}` });
      }
    }
  );

  // ── GET /api/tenants/:tenantId/deploy ──────────────────────────────────────
  // Returns the last build metadata (or 404 if never built).
  fastify.get<{ Params: { tenantId: string } }>(
    '/:tenantId/deploy',
    builder,
    async (req, reply) => {
      const { tenantId } = req.params;
      const info = await getBuildInfo(tenantId);
      if (!info) return reply.status(404).send({ error: 'No build found' });
      return reply.send(info);
    }
  );

  // ── GET /api/tenants/:tenantId/deploy/download ─────────────────────────────
  // Streams the primary .tar.gz package to the client.
  fastify.get<{ Params: { tenantId: string } }>(
    '/:tenantId/deploy/download',
    builder,
    async (req, reply) => {
      const { tenantId } = req.params;
      const info = await getBuildInfo(tenantId);
      if (!info) return reply.status(404).send({ error: 'No build found — trigger a build first' });

      const pkgPath = primaryPackagePath(tenantId, info.slug);
      try {
        await fs.access(pkgPath);
      } catch {
        return reply.status(404).send({ error: 'Package file missing — re-run deploy' });
      }

      const stream = (await import('node:fs')).createReadStream(pkgPath);
      return reply
        .header('Content-Type', 'application/gzip')
        .header('Content-Disposition', `attachment; filename="${info.filename}"`)
        .send(stream);
    }
  );
}
