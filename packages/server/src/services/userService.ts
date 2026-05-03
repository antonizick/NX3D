import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import type { UserRecord, UsersFile } from '../types/index.js';
import { config } from '../config.js';
import { readJson, writeJson, readJsonOptional } from './fileStore.js';
import { tenantUsersPath } from './tenantService.js';

const BCRYPT_ROUNDS = 12;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadUsers(tenantId: string): Promise<UserRecord[]> {
  const file = await readJsonOptional<UsersFile>(tenantUsersPath(tenantId));
  return file?.users ?? [];
}

async function saveUsers(tenantId: string, users: UserRecord[]): Promise<void> {
  await writeJson(tenantUsersPath(tenantId), { users });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function listUsers(tenantId: string): Promise<Omit<UserRecord, 'passwordHash' | 'totpSecret'>[]> {
  const users = await loadUsers(tenantId);
  return users.map(({ passwordHash: _p, totpSecret: _t, ...rest }) => rest);
}

export async function getUser(tenantId: string, userId: string): Promise<UserRecord | null> {
  const users = await loadUsers(tenantId);
  return users.find(u => u.id === userId) ?? null;
}

export async function getUserByUsername(tenantId: string, username: string): Promise<UserRecord | null> {
  const users = await loadUsers(tenantId);
  return users.find(u => u.username === username) ?? null;
}

export async function createUser(
  tenantId: string,
  username: string,
  password: string,
  role: 'builder' | 'player'
): Promise<UserRecord> {
  const users = await loadUsers(tenantId);
  if (users.some(u => u.username === username)) {
    throw new Error(`Username "${username}" already exists`);
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user: UserRecord = {
    id: uuidv4(),
    username,
    passwordHash,
    role,
    totpEnabled: false,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await saveUsers(tenantId, users);
  return user;
}

export async function updateUser(
  tenantId: string,
  userId: string,
  patch: { password?: string; role?: 'builder' | 'player' }
): Promise<void> {
  const users = await loadUsers(tenantId);
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('User not found');
  if (patch.password) {
    users[idx]!.passwordHash = await bcrypt.hash(patch.password, BCRYPT_ROUNDS);
  }
  if (patch.role) {
    users[idx]!.role = patch.role;
  }
  await saveUsers(tenantId, users);
}

export async function deleteUser(tenantId: string, userId: string): Promise<void> {
  let users = await loadUsers(tenantId);
  users = users.filter(u => u.id !== userId);
  await saveUsers(tenantId, users);
}

export async function verifyPassword(user: UserRecord, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

export async function touchLastLogin(tenantId: string, userId: string): Promise<void> {
  const users = await loadUsers(tenantId);
  const u = users.find(u => u.id === userId);
  if (u) {
    u.lastLogin = new Date().toISOString();
    await saveUsers(tenantId, users);
  }
}

// ─── TOTP ─────────────────────────────────────────────────────────────────────

export async function generateTotpSetup(
  tenantId: string,
  userId: string
): Promise<{ secret: string; qrDataUrl: string }> {
  const users = await loadUsers(tenantId);
  const user  = users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  const secret = speakeasy.generateSecret({
    name:   `${config.totpIssuer} (${user.username})`,
    issuer: config.totpIssuer,
    length: 20,
  });

  // Store pending secret (not yet confirmed)
  user.totpSecret = secret.base32;
  await saveUsers(tenantId, users);

  const otpauthUrl = secret.otpauth_url ?? '';
  const qrDataUrl  = await qrcode.toDataURL(otpauthUrl);

  return { secret: secret.base32, qrDataUrl };
}

export async function enableTotp(
  tenantId: string,
  userId: string,
  token: string
): Promise<void> {
  const users = await loadUsers(tenantId);
  const user  = users.find(u => u.id === userId);
  if (!user?.totpSecret) throw new Error('No pending TOTP secret');

  const valid = speakeasy.totp.verify({
    secret:   user.totpSecret,
    encoding: 'base32',
    token,
    window:   1,
  });
  if (!valid) throw new Error('Invalid TOTP token');

  user.totpEnabled = true;
  await saveUsers(tenantId, users);
}

export function verifyTotp(secret: string, token: string): boolean {
  return speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
}
