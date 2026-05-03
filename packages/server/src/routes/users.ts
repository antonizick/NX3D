import type { FastifyInstance } from 'fastify';
import * as userService from '../services/userService.js';

interface CreateBody { username: string; password: string; role: 'builder' | 'player'; }
interface UpdateBody { password?: string; role?: 'builder' | 'player'; }

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  const builder = { preHandler: [fastify.requireBuilder] };

  fastify.get<{ Params: { tenantId: string } }>(
    '/:tenantId/users', builder, async (req, reply) => {
      const users = await userService.listUsers(req.params.tenantId);
      return reply.send(users);
    }
  );

  fastify.post<{ Params: { tenantId: string }; Body: CreateBody }>(
    '/:tenantId/users', {
      ...builder,
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password', 'role'],
          properties: {
            username: { type: 'string', minLength: 2, maxLength: 40 },
            password: { type: 'string', minLength: 8 },
            role:     { type: 'string', enum: ['builder', 'player'] },
          },
        },
      },
    }, async (req, reply) => {
      const { username, password, role } = req.body;
      const user = await userService.createUser(req.params.tenantId, username, password, role);
      const { passwordHash: _p, totpSecret: _t, ...safe } = user;
      return reply.status(201).send(safe);
    }
  );

  fastify.put<{ Params: { tenantId: string; userId: string }; Body: UpdateBody }>(
    '/:tenantId/users/:userId', builder, async (req, reply) => {
      await userService.updateUser(req.params.tenantId, req.params.userId, req.body);
      return reply.send({ ok: true });
    }
  );

  fastify.delete<{ Params: { tenantId: string; userId: string } }>(
    '/:tenantId/users/:userId', builder, async (req, reply) => {
      await userService.deleteUser(req.params.tenantId, req.params.userId);
      return reply.send({ ok: true });
    }
  );
}
