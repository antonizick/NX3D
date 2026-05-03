import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import * as tenantService from '../services/tenantService.js';
import { ensureDir, writeJson } from '../services/fileStore.js';
import type { TenantConfig } from '../types/index.js';

export async function tenantsRoutes(fastify: FastifyInstance): Promise<void> {
  // All tenant management requires builder role
  const builder = { preHandler: [fastify.requireBuilder] };

  // ── GET /api/tenants ──────────────────────────────────────────────────────
  fastify.get('/', builder, async (_req, reply) => {
    const tenants = await tenantService.listTenants();
    return reply.send(tenants);
  });

  // ── POST /api/tenants ─────────────────────────────────────────────────────
  fastify.post<{ Body: { name: string } }>('/', {
    ...builder,
    schema: {
      body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 80 } } },
    },
  }, async (req, reply) => {
    const tenant = await tenantService.createTenant(req.body.name);
    return reply.status(201).send(tenant);
  });

  // ── GET /api/tenants/:tenantId ────────────────────────────────────────────
  fastify.get<{ Params: { tenantId: string } }>('/:tenantId', builder, async (req, reply) => {
    const tenant = await tenantService.getTenant(req.params.tenantId);
    if (!tenant) return reply.status(404).send({ error: 'Not found' });
    return reply.send(tenant);
  });

  // ── PUT /api/tenants/:tenantId ────────────────────────────────────────────
  fastify.put<{ Params: { tenantId: string }; Body: Partial<TenantConfig> }>(
    '/:tenantId', builder, async (req, reply) => {
      const updated = await tenantService.updateTenant(req.params.tenantId, req.body);
      return reply.send(updated);
    }
  );

  // ── DELETE /api/tenants/:tenantId ─────────────────────────────────────────
  fastify.delete<{ Params: { tenantId: string } }>('/:tenantId', builder, async (req, reply) => {
    await tenantService.deleteTenant(req.params.tenantId);
    return reply.send({ ok: true });
  });

  // ── POST /api/tenants/:tenantId/clone ────────────────────────────────────
  fastify.post<{ Params: { tenantId: string }; Body: { name: string } }>(
    '/:tenantId/clone', {
      ...builder,
      schema: {
        body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 80 } } },
      },
    }, async (req, reply) => {
      const source = await tenantService.getTenant(req.params.tenantId);
      if (!source) return reply.status(404).send({ error: 'Not found' });
      const cloned = await tenantService.cloneTenant(req.params.tenantId, req.body.name);
      return reply.status(201).send(cloned);
    }
  );

  // ── POST /api/tenants/:tenantId/logo ──────────────────────────────────────
  fastify.post<{ Params: { tenantId: string } }>(
    '/:tenantId/logo', builder, async (req, reply) => {
      const { tenantId } = req.params;
      const tenant = await tenantService.getTenant(tenantId);
      if (!tenant) return reply.status(404).send({ error: 'Not found' });

      const parts = req.files();
      let logoBuffer: Buffer | null = null;
      for await (const part of parts) {
        const file = part as MultipartFile;
        const chunks: Buffer[] = [];
        for await (const chunk of file.file) chunks.push(chunk as Buffer);
        logoBuffer = Buffer.concat(chunks);
        break; // only first file
      }

      if (!logoBuffer || logoBuffer.length === 0) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const assetsDir = path.join(tenantService.tenantRoot(tenantId), 'assets');
      await ensureDir(assetsDir);
      const destPath = path.join(assetsDir, 'logo.webp');

      const image = sharp(logoBuffer);
      const meta  = await image.metadata();
      const w = meta.width  ?? 512;
      const h = meta.height ?? 512;
      const processed = (w > 512 || h > 512)
        ? image.resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        : image;

      await fs.writeFile(destPath, await processed.webp({ quality: 90 }).toBuffer());

      const logoUrl = `/assets/${tenantId}/assets/logo.webp`;
      await tenantService.updateTenant(tenantId, { logoUrl });
      return reply.send({ ok: true, logoUrl });
    }
  );

  // ── DELETE /api/tenants/:tenantId/logo ────────────────────────────────────
  fastify.delete<{ Params: { tenantId: string } }>(
    '/:tenantId/logo', builder, async (req, reply) => {
      const { tenantId } = req.params;
      const tenant = await tenantService.getTenant(tenantId);
      if (!tenant) return reply.status(404).send({ error: 'Not found' });

      const destPath = path.join(tenantService.tenantRoot(tenantId), 'assets', 'logo.webp');
      await fs.unlink(destPath).catch(() => { /* already gone */ });

      const { logoUrl: _removed, ...rest } = tenant;
      await writeJson(tenantService.tenantConfigPath(tenantId), { ...rest, tenantId });
      return reply.send({ ok: true });
    }
  );
}
