import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import * as assetService from '../services/assetService.js';
import type { AssetCategory } from '../services/assetService.js';

export async function assetsRoutes(fastify: FastifyInstance): Promise<void> {
  const builder = { preHandler: [fastify.requireBuilder] };

  // ── GET /api/tenants/:tenantId/assets?category=textures&subId=guard ──────
  fastify.get<{
    Params: { tenantId: string };
    Querystring: { category: AssetCategory; subId?: string };
  }>('/:tenantId/assets', builder, async (req, reply) => {
    const { tenantId } = req.params;
    const { category, subId } = req.query;
    const files = await assetService.listAssets(tenantId, category, subId);
    return reply.send({ files });
  });

  // ── POST /api/tenants/:tenantId/assets/upload ─────────────────────────────
  fastify.post<{
    Params: { tenantId: string };
    Querystring: { category: AssetCategory; subId?: string };
  }>('/:tenantId/assets/upload', builder, async (req, reply) => {
    const { tenantId }     = req.params;
    const { category, subId } = req.query;

    if (!category) return reply.status(400).send({ error: 'category query param required' });

    const results: assetService.UploadedAsset[] = [];

    // Process all uploaded parts (bulk upload)
    const parts = req.files();
    for await (const part of parts) {
      const file = part as MultipartFile;
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) chunks.push(chunk as Buffer);
      const buffer = Buffer.concat(chunks);

      if (buffer.length === 0) continue;
      const limitBytes = assetService.isAudioMime(file.mimetype) ? 20 * 1024 * 1024 : 8 * 1024 * 1024;
      if (buffer.length > limitBytes) {
        const limitMB = limitBytes / (1024 * 1024);
        return reply.status(413).send({ error: `File ${file.filename} exceeds ${limitMB} MB limit` });
      }

      const result = await assetService.processAndSaveAsset(
        tenantId,
        category,
        subId,
        file.filename,
        file.mimetype,
        buffer
      );
      results.push(result);
    }

    return reply.status(201).send({ uploaded: results });
  });

  // ── POST /api/tenants/:tenantId/assets/reset ─────────────────────────────
  fastify.post<{
    Params: { tenantId: string };
    Body: { category: AssetCategory; filename: string; subId?: string };
  }>('/:tenantId/assets/reset', {
    ...builder,
    schema: {
      body: {
        type: 'object',
        required: ['category', 'filename'],
        properties: {
          category: { type: 'string' },
          filename: { type: 'string' },
          subId:    { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { tenantId }              = req.params;
    const { category, filename, subId } = req.body;
    try {
      await assetService.resetAssetToDefault(tenantId, category, filename, subId);
      return reply.send({ ok: true });
    } catch (err: unknown) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'NOT_FOUND') {
        return reply.status(404).send({ error: err.message });
      }
      throw err;
    }
  });

  // ── DELETE /api/tenants/:tenantId/assets ──────────────────────────────────
  fastify.delete<{
    Params: { tenantId: string };
    Body: { category: AssetCategory; filename: string; subId?: string };
  }>('/:tenantId/assets', {
    ...builder,
    schema: {
      body: {
        type: 'object',
        required: ['category', 'filename'],
        properties: {
          category: { type: 'string' },
          filename: { type: 'string' },
          subId:    { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { tenantId }              = req.params;
    const { category, filename, subId } = req.body;
    await assetService.removeAsset(tenantId, category, filename, subId);
    return reply.send({ ok: true });
  });
}
