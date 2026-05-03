import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { generateLevel } from '../services/levelGenerator.js';
import { getTenant } from '../services/tenantService.js';
import { tenantLevelsDir } from '../services/tenantService.js';
import { writeJson, listDir, readJsonOptional, deleteFile } from '../services/fileStore.js';
import type { LevelData, TenantConfig } from '../types/index.js';

function levelPath(tenantId: string, levelId: number): string {
  return path.join(tenantLevelsDir(tenantId), `level_${String(levelId).padStart(2, '0')}.json`);
}

async function doGenerate(tenant: TenantConfig, levelId: number, episode: number, difficulty: 'easy' | 'normal' | 'hard'): Promise<LevelData> {
  const levelsPerEpisode = tenant.game.levelsPerEpisode;
  const isFinalLevel = levelId === levelsPerEpisode && episode === tenant.game.episodes;
  const data = generateLevel({
    levelId, episode, levelsPerEpisode,
    isFinalLevel, difficulty,
    enemies: tenant.enemies,
    items:   tenant.items,
    textures: tenant.textures,
    seed: (Math.random() * 0xFFFFFFFF) >>> 0,
  });
  await writeJson(levelPath(tenant.tenantId, levelId), data);
  return data;
}

export async function levelsRoutes(fastify: FastifyInstance): Promise<void> {
  const builder = { preHandler: [fastify.requireBuilder] };

  // ── GET /api/tenants/:tenantId/levels ─────────────────────────────────────
  fastify.get<{ Params: { tenantId: string } }>(
    '/:tenantId/levels', builder, async (req, reply) => {
      const files = await listDir(tenantLevelsDir(req.params.tenantId));
      const levels = files.filter(f => f.endsWith('.json'));
      return reply.send({ levels });
    }
  );

  // ── GET /api/tenants/:tenantId/levels/:levelId ────────────────────────────
  fastify.get<{ Params: { tenantId: string; levelId: string } }>(
    '/:tenantId/levels/:levelId', builder, async (req, reply) => {
      const id    = parseInt(req.params.levelId, 10);
      const level = await readJsonOptional<LevelData>(levelPath(req.params.tenantId, id));
      if (!level) return reply.status(404).send({ error: 'Level not generated yet' });
      return reply.send(level);
    }
  );

  // ── PATCH /api/tenants/:tenantId/levels/:levelId ─────────────────────────
  fastify.patch<{
    Params: { tenantId: string; levelId: string };
    Body:   { onLoadMessage?: string; onExitMessage?: string };
  }>('/:tenantId/levels/:levelId', {
    ...builder,
    schema: {
      body: {
        type: 'object',
        properties: {
          onLoadMessage: { type: 'string' },
          onExitMessage: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const id  = parseInt(req.params.levelId, 10);
    const lPath = levelPath(req.params.tenantId, id);
    const existing = await readJsonOptional<LevelData>(lPath);
    if (!existing) return reply.status(404).send({ error: 'Level not found' });
    if (req.body.onLoadMessage !== undefined) existing.onLoadMessage = req.body.onLoadMessage;
    if (req.body.onExitMessage !== undefined) existing.onExitMessage = req.body.onExitMessage;
    await writeJson(lPath, existing);
    return reply.send(existing);
  });

  // ── POST /api/tenants/:tenantId/levels/generate ───────────────────────────
  // "Build the World" button — generates ALL levels
  fastify.post<{
    Params: { tenantId: string };
    Body:   { difficulty?: 'easy' | 'normal' | 'hard' };
  }>('/:tenantId/levels/generate', {
    ...builder,
    schema: {
      body: {
        type: 'object',
        properties: { difficulty: { type: 'string', enum: ['easy', 'normal', 'hard'] } },
      },
    },
  }, async (req, reply) => {
    const tenant = await getTenant(req.params.tenantId);
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const difficulty = req.body.difficulty ?? 'normal';
    const generated: number[] = [];

    for (let ep = 1; ep <= tenant.game.episodes; ep++) {
      for (let lv = 1; lv <= tenant.game.levelsPerEpisode; lv++) {
        await doGenerate(tenant, lv, ep, difficulty);
        generated.push(lv);
      }
    }

    return reply.send({ ok: true, generated });
  });

  // ── DELETE /api/tenants/:tenantId/levels ─────────────────────────────────
  fastify.delete<{ Params: { tenantId: string } }>(
    '/:tenantId/levels', builder, async (req, reply) => {
      const dir = tenantLevelsDir(req.params.tenantId);
      const files = await listDir(dir);
      const levelFiles = files.filter(f => /^level_\d+\.json$/.test(f));
      await Promise.all(levelFiles.map(f => deleteFile(path.join(dir, f))));
      return reply.send({ ok: true, deleted: levelFiles.length });
    }
  );

  // ── POST /api/tenants/:tenantId/levels/:levelId/regenerate ────────────────
  fastify.post<{
    Params: { tenantId: string; levelId: string };
    Body:   { difficulty?: 'easy' | 'normal' | 'hard'; episode?: number };
  }>('/:tenantId/levels/:levelId/regenerate', {
    ...builder,
    schema: {
      body: {
        type: 'object',
        properties: {
          difficulty: { type: 'string', enum: ['easy', 'normal', 'hard'] },
          episode:    { type: 'number', minimum: 1 },
        },
      },
    },
  }, async (req, reply) => {
    const tenant = await getTenant(req.params.tenantId);
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const levelId    = parseInt(req.params.levelId, 10);
    const episode    = req.body.episode    ?? 1;
    const difficulty = req.body.difficulty ?? 'normal';

    const data = await doGenerate(tenant, levelId, episode, difficulty);
    return reply.send(data);
  });
}
