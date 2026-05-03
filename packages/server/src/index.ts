// Load .env before anything else reads process.env
import { config as loadEnv } from 'dotenv';
loadEnv();
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';

import { config } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes }    from './routes/auth.js';
import { tenantsRoutes } from './routes/tenants.js';
import { usersRoutes }   from './routes/users.js';
import { assetsRoutes }  from './routes/assets.js';
import { levelsRoutes }  from './routes/levels.js';
import { gameRoutes }    from './routes/game.js';
import { deployRoutes }  from './routes/deploy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bootstrap() {
  const fastify = Fastify({
    disableRequestLogging: config.nodeEnv !== 'production',
    logger: {
      level: config.nodeEnv === 'production' ? 'warn' : 'info',
      transport: config.nodeEnv !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  });

  // ── Plugins ───────────────────────────────────────────────────────────────
  await fastify.register(fastifyCors, {
    origin: [config.adminOrigin, config.gameOrigin],
    credentials: true,
  });

  await fastify.register(fastifyCookie, { secret: config.cookieSecret });

  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'auth', signed: false },
  });

  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 20 },
  });

  await fastify.register(authPlugin);

  // ── Static: serve built frontends (production only, public/ won't exist in dev) ──
  const publicDir = path.join(__dirname, 'public');
  const { existsSync } = await import('node:fs');
  if (existsSync(publicDir)) {
    await fastify.register(fastifyStatic, {
      root:          publicDir,
      prefix:        '/',
      index:         false,
      decorateReply: false,
    });
  }

  // ── Static: serve tenant assets ───────────────────────────────────────────
  await fastify.register(fastifyStatic, {
    root:           config.tenantsRoot,
    prefix:         '/assets/',
    decorateReply:  false,
    index:          false,
  });

  // ── SPA fallback for admin + game ─────────────────────────────────────────
  fastify.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/admin')) {
      return reply.sendFile('admin/index.html');
    }
    if (req.url.startsWith('/game')) {
      return reply.sendFile('game/index.html');
    }
    reply.status(404).send({ error: 'Not found' });
  });

  // ── API Routes ────────────────────────────────────────────────────────────
  await fastify.register(authRoutes,    { prefix: '/api/auth' });
  await fastify.register(tenantsRoutes, { prefix: '/api/tenants' });
  await fastify.register(usersRoutes,   { prefix: '/api/tenants' });
  await fastify.register(assetsRoutes,  { prefix: '/api/tenants' });
  await fastify.register(levelsRoutes,  { prefix: '/api/tenants' });
  await fastify.register(gameRoutes,    { prefix: '/api/game' });
  await fastify.register(deployRoutes,  { prefix: '/api/tenants' });

  // ── Start ─────────────────────────────────────────────────────────────────
  await fastify.listen({ port: config.port, host: config.host });
  fastify.log.info(`Server listening at http://${config.host}:${config.port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
