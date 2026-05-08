import type { FastifyInstance } from 'fastify';
import * as userService from '../services/userService.js';
import { getTenant, listTenants } from '../services/tenantService.js';
import type { JwtPayload } from '../types/index.js';

interface LoginBody {
  tenantId: string;
  username: string;
  password: string;
}

interface MfaBody {
  tenantId: string;
  userId: string;
  token: string;
}

interface MfaEnableBody {
  token: string;
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/auth/login ──────────────────────────────────────────────────
  fastify.post<{ Body: LoginBody }>('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['tenantId', 'username', 'password'],
        properties: {
          tenantId: { type: 'string' },
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { tenantId, username, password } = req.body;

    const tenant = await getTenant(tenantId);
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const user = await userService.getUserByUsername(tenantId, username);
    if (!user) return reply.status(401).send({ error: 'Invalid credentials' });

    const valid = await userService.verifyPassword(user, password);
    if (!valid) return reply.status(401).send({ error: 'Invalid credentials' });

    if (user.totpEnabled) {
      // Return partial auth — client must follow up with MFA token
      return reply.send({ mfaRequired: true, userId: user.id });
    }

    await userService.touchLastLogin(tenantId, user.id);
    const payload: JwtPayload = { tenantId, userId: user.id, username, role: user.role };
    const token = fastify.jwt.sign(payload, { expiresIn: '12h' });
    reply.setCookie('auth', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
    return reply.send({ ok: true, role: user.role, tenantId, username });
  });

  // ── POST /api/auth/verify-mfa ─────────────────────────────────────────────
  fastify.post<{ Body: MfaBody }>('/verify-mfa', {
    schema: {
      body: {
        type: 'object',
        required: ['tenantId', 'userId', 'token'],
        properties: {
          tenantId: { type: 'string' },
          userId:   { type: 'string' },
          token:    { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { tenantId, userId, token } = req.body;

    const user = await userService.getUser(tenantId, userId);
    if (!user?.totpSecret) return reply.status(401).send({ error: 'Invalid state' });

    const valid = userService.verifyTotp(user.totpSecret, token);
    if (!valid) return reply.status(401).send({ error: 'Invalid TOTP token' });

    await userService.touchLastLogin(tenantId, userId);
    const payload: JwtPayload = { tenantId, userId, username: user.username, role: user.role };
    const jwtToken = fastify.jwt.sign(payload, { expiresIn: '12h' });
    reply.setCookie('auth', jwtToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
    return reply.send({ ok: true, role: user.role, tenantId, username: user.username });
  });

  // ── GET /api/auth/tenants ─────────────────────────────────────────────────
  fastify.get('/tenants', async (_req, reply) => {
    const tenants = await listTenants();
    return reply.send(tenants.map(t => ({ tenantId: t.tenantId, name: t.name })));
  });

  // ── POST /api/auth/logout ─────────────────────────────────────────────────
  fastify.post('/logout', async (_req, reply) => {
    reply.clearCookie('auth', { path: '/' });
    return reply.send({ ok: true });
  });

  // ── GET /api/auth/me ──────────────────────────────────────────────────────
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    return reply.send(req.user);
  });

  // ── GET /api/auth/mfa-setup ───────────────────────────────────────────────
  fastify.get('/mfa-setup', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { tenantId, userId } = req.user;
    const setup = await userService.generateTotpSetup(tenantId, userId);
    return reply.send(setup);
  });

  // ── POST /api/auth/mfa-enable ─────────────────────────────────────────────
  fastify.post<{ Body: MfaEnableBody }>('/mfa-enable', {
    preHandler: [fastify.authenticate],
    schema: {
      body: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
    },
  }, async (req, reply) => {
    const { tenantId, userId } = req.user;
    await userService.enableTotp(tenantId, userId, req.body.token);
    return reply.send({ ok: true });
  });
}
