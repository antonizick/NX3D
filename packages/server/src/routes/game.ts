/**
 * Public-facing game endpoints consumed by the game frontend.
 * Players authenticate via JWT cookie (same auth system, player role).
 */
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { getTenant } from '../services/tenantService.js';
import { tenantLevelsDir, tenantSavesDir } from '../services/tenantService.js';
import { readJsonOptional, writeJson, ensureDir } from '../services/fileStore.js';
import type { LevelData, SaveData } from '../types/index.js';

function savePath(tenantId: string, playerId: string): string {
  return path.join(tenantSavesDir(tenantId), `${playerId}_save.json`);
}

export async function gameRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = { preHandler: [fastify.authenticate] };

  // ── GET /api/game/:tenantId/config ────────────────────────────────────────
  // Semi-public: returns tenant config (no sensitive data)
  fastify.get<{ Params: { tenantId: string } }>(
    '/:tenantId/config', async (req, reply) => {
      const tenant = await getTenant(req.params.tenantId);
      if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
      return reply.send(tenant);
    }
  );

  // ── GET /api/game/:tenantId/level/:levelId ────────────────────────────────
  fastify.get<{ Params: { tenantId: string; levelId: string } }>(
    '/:tenantId/level/:levelId', auth, async (req, reply) => {
      const { tenantId, levelId } = req.params;
      const id = parseInt(levelId, 10);
      const levelFile = path.join(
        tenantLevelsDir(tenantId),
        `level_${String(id).padStart(2, '0')}.json`
      );
      const level = await readJsonOptional<LevelData>(levelFile);
      if (!level) return reply.status(404).send({ error: 'Level not found' });
      return reply.send(level);
    }
  );

  // ── GET /api/game/:tenantId/save ──────────────────────────────────────────
  fastify.get<{ Params: { tenantId: string } }>(
    '/:tenantId/save', auth, async (req, reply) => {
      const { tenantId } = req.params;
      const playerId = req.user.userId;
      const save = await readJsonOptional<SaveData>(savePath(tenantId, playerId));
      if (!save) return reply.status(404).send({ error: 'No save found' });
      return reply.send(save);
    }
  );

  // ── POST /api/game/:tenantId/save ─────────────────────────────────────────
  fastify.post<{ Params: { tenantId: string }; Body: Omit<SaveData, 'playerId' | 'tenantId' | 'savedAt'> }>(
    '/:tenantId/save', auth, async (req, reply) => {
      const { tenantId } = req.params;
      const playerId = req.user.userId;

      const save: SaveData = {
        ...req.body,
        playerId,
        tenantId,
        savedAt: new Date().toISOString(),
      };

      await ensureDir(tenantSavesDir(tenantId));
      await writeJson(savePath(tenantId, playerId), save);
      return reply.send({ ok: true });
    }
  );
}
