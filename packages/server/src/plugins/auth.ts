import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload } from '../types/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireBuilder: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: JwtPayload;
  }
}

async function authPluginFn(fastify: FastifyInstance): Promise<void> {
  fastify.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
      } catch {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  );

  fastify.decorate(
    'requireBuilder',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
        if (req.user.role !== 'builder') {
          reply.status(403).send({ error: 'Builder role required' });
        }
      } catch {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  );
}

export const authPlugin = fp(authPluginFn);
