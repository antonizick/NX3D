import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { config } from '../config.js';
import type { TenantConfig } from '../types/index.js';
import {
  ensureDir, readJson, writeJson, readJsonOptional,
  copyDir, exists, listDir, deleteDir,
} from './fileStore.js';

// ─── Paths ───────────────────────────────────────────────────────────────────

export function tenantRoot(tenantId: string) {
  return path.join(config.tenantsRoot, tenantId);
}
export function tenantConfigPath(tenantId: string) {
  return path.join(tenantRoot(tenantId), 'config.json');
}
export function tenantUsersPath(tenantId: string) {
  return path.join(tenantRoot(tenantId), 'users.json');
}
export function tenantLevelsDir(tenantId: string) {
  return path.join(tenantRoot(tenantId), 'levels');
}
export function tenantAssetsDir(tenantId: string) {
  return path.join(tenantRoot(tenantId), 'assets');
}
export function tenantSavesDir(tenantId: string) {
  return path.join(tenantRoot(tenantId), 'saves');
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listTenants(): Promise<TenantConfig[]> {
  const entries = await listDir(config.tenantsRoot);
  const configs: TenantConfig[] = [];
  for (const entry of entries) {
    if (entry.startsWith('_')) continue; // skip _defaults etc.
    const cfg = await readJsonOptional<TenantConfig>(
      tenantConfigPath(entry)
    );
    if (cfg) configs.push(cfg);
  }
  return configs;
}

export async function getTenant(tenantId: string): Promise<TenantConfig | null> {
  return readJsonOptional<TenantConfig>(tenantConfigPath(tenantId));
}

export async function createTenant(name: string): Promise<TenantConfig> {
  const tenantId = uuidv4();
  const root = tenantRoot(tenantId);

  // Scaffold directory tree
  await ensureDir(root);
  await ensureDir(path.join(root, 'levels'));
  await ensureDir(path.join(root, 'saves'));
  await ensureDir(path.join(root, 'assets', 'textures'));
  await ensureDir(path.join(root, 'assets', 'sprites', 'enemies'));
  await ensureDir(path.join(root, 'assets', 'sprites', 'weapons'));
  await ensureDir(path.join(root, 'assets', 'sprites', 'items'));
  await ensureDir(path.join(root, 'assets', 'sprites', 'player_portraits'));
  await ensureDir(path.join(root, 'assets', 'sprites', 'projectiles'));
  await ensureDir(path.join(root, 'assets', 'sounds', 'music'));
  await ensureDir(path.join(root, 'assets', 'sounds', 'player'));
  await ensureDir(path.join(root, 'assets', 'sounds', 'enemies'));
  await ensureDir(path.join(root, 'assets', 'sounds', 'weapons'));
  await ensureDir(path.join(root, 'assets', 'sounds', 'items'));

  // Copy defaults (textures, placeholder sprites)
  if (await exists(config.defaultsRoot)) {
    await copyDir(
      path.join(config.defaultsRoot, 'assets'),
      path.join(root, 'assets')
    );
  } else {
    await generatePlaceholderAssets(root);
  }

  const cfg: TenantConfig = defaultConfig(tenantId, name);
  await writeJson(tenantConfigPath(tenantId), cfg);
  await writeJson(tenantUsersPath(tenantId), { users: [] });

  return cfg;
}

export async function updateTenant(
  tenantId: string,
  patch: Partial<TenantConfig>
): Promise<TenantConfig> {
  const existing = await readJson<TenantConfig>(tenantConfigPath(tenantId));
  const updated: TenantConfig = { ...existing, ...patch, tenantId };
  await writeJson(tenantConfigPath(tenantId), updated);
  return updated;
}

export async function deleteTenant(tenantId: string): Promise<void> {
  await deleteDir(tenantRoot(tenantId));
}

export async function cloneTenant(sourceTenantId: string, newName: string): Promise<TenantConfig> {
  const sourceRoot = tenantRoot(sourceTenantId);
  const sourceCfg  = await readJson<TenantConfig>(tenantConfigPath(sourceTenantId));

  const newTenantId = uuidv4();
  const newRoot     = tenantRoot(newTenantId);

  await copyDir(sourceRoot, newRoot);

  const newCfg: TenantConfig = {
    ...sourceCfg,
    tenantId:  newTenantId,
    name:      newName,
    createdAt: new Date().toISOString(),
    game:      { ...sourceCfg.game, title: newName },
    ...(sourceCfg.logoUrl
      ? { logoUrl: sourceCfg.logoUrl.replace(sourceTenantId, newTenantId) }
      : { logoUrl: undefined }),
  };

  await writeJson(tenantConfigPath(newTenantId), newCfg);
  await writeJson(tenantUsersPath(newTenantId), { users: [] });

  // Clear saves — player progress should not carry over
  const savesDir = tenantSavesDir(newTenantId);
  await deleteDir(savesDir);
  await ensureDir(savesDir);

  return newCfg;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

function defaultConfig(tenantId: string, name: string): TenantConfig {
  return {
    tenantId,
    name,
    createdAt: new Date().toISOString(),
    theme: {
      primaryColor: '#c8a000',
      accentColor:  '#8b0000',
      hudColor:     '#3a3a3a',
      skyColor:     '#383838',
      floorColor:   '#707070',
    },
    game: {
      title:           name,
      episodes:        1,
      levelsPerEpisode: 9,
      startingLives:   3,
      maxHealth:       100,
      maxAmmo:         { bullets: 99, shells: 50 },
    },
    enemies: [defaultEnemy()],
    weapons: [defaultPistol(), defaultKnife()],
    items:   defaultItems(),
    textures: defaultTextures(),
    audio: {
      music:       ['background.mp3'],
      playerStep:  'step.mp3',
      playerDeath: 'death.mp3',
    },
  };
}

function defaultEnemy(): import('../types/index.js').EnemyManifest {
  return {
    id: 'guard',
    name: 'Guard',
    hp: 25,
    speed: 1.5,
    attackDamage: 8,
    attackRange: 2.0,
    attackCooldown: 1500,
    sightRange: 12,
    isBoss: false,
    score: 100,
    dropItem: null,
    sprites: {
      angles: 8,
      walk:   { frames: 4, fps: 8 },
      attack: { frames: 2, fps: 8 },
      death:  { frames: 5, fps: 10 },
      pain:   { frames: 1, fps: 4 },
    },
    sounds: { alert: 'alert.mp3', pain: 'pain.mp3', death: 'death.mp3', attack: 'attack.mp3', step: 'step.mp3' },
  };
}

function defaultPistol(): import('../types/index.js').WeaponManifest {
  return {
    id: 'pistol',
    name: 'Pistol',
    damage: 15,
    fireRate: 2,
    ammoType: 'bullets',
    ammoPerShot: 1,
    behaviorType: 'hitscan',
    spread: 0,
    frames: 5,
    fps: 12,
    sounds: { fire: 'fire.mp3', empty: 'empty.mp3', reload: 'reload.mp3' },
  };
}

function defaultKnife(): import('../types/index.js').WeaponManifest {
  return {
    id: 'knife',
    name: 'Knife',
    damage: 10,
    fireRate: 2,
    ammoType: 'none',
    ammoPerShot: 0,
    behaviorType: 'hitscan',
    spread: 0,
    frames: 4,
    fps: 10,
    sounds: { fire: '', empty: '' },
  };
}

function defaultItems(): import('../types/index.js').ItemManifest[] {
  return [
    { id: 'medkit',    name: 'Med Kit',    type: 'health',   value: 25, score: 0,    sounds: { pickup: 'pickup.mp3' } },
    { id: 'food',      name: 'Food',       type: 'health',   value: 10, score: 0,    sounds: { pickup: 'pickup.mp3' } },
    { id: 'ammo_clip', name: 'Ammo Clip',  type: 'ammo',     value: 8,  ammoType: 'bullets', score: 0, sounds: { pickup: 'pickup.mp3' } },
    { id: 'key_gold',  name: 'Gold Key',   type: 'key',      value: 1,  keyColor: 'gold',    score: 0, sounds: { pickup: 'pickup.mp3' } },
    { id: 'key_silver',name: 'Silver Key', type: 'key',      value: 1,  keyColor: 'silver',  score: 0, sounds: { pickup: 'pickup.mp3' } },
    { id: 'treasure1', name: 'Cross',      type: 'treasure', value: 0,  score: 100,  sounds: { pickup: 'pickup.mp3' } },
    { id: 'treasure2', name: 'Chalice',    type: 'treasure', value: 0,  score: 500,  sounds: { pickup: 'pickup.mp3' } },
    { id: 'treasure3', name: 'Crown',      type: 'treasure', value: 0,  score: 5000, sounds: { pickup: 'pickup.mp3' } },
    { id: 'oneup',     name: 'Extra Life', type: 'life',     value: 1,  score: 0,    sounds: { pickup: 'pickup.mp3' } },
    { id: 'exit',      name: 'Exit',       type: 'exit',     value: 0,  score: 0 },
  ];
}

function defaultTextures(): import('../types/index.js').TextureManifest[] {
  return [
    { id: '1', name: 'Wall Tile 1', path: 'ceiling.webp',    type: 'wall' },
    { id: '2', name: 'Wall Tile 2', path: 'floor_tile.webp', type: 'wall' },
    { id: '3', name: 'Wall Tile 3', path: 'door.webp',       type: 'wall' },
    { id: '4', name: 'Wall Tile 4', path: 'wall_brick.webp', type: 'wall' },
    { id: '5', name: 'Wall Tile 5', path: 'wall_stone.webp', type: 'wall' },
    { id: '6', name: 'Wall Tile 6', path: 'wall_wood.webp',  type: 'wall' },
  ];
}

/** Generate colored placeholder WebP images when no _defaults exist. */
async function generatePlaceholderAssets(root: string): Promise<void> {
  const texDir = path.join(root, 'assets', 'textures');

  const placeholders: [string, [number, number, number]][] = [
    ['wall_stone.webp',  [120, 120, 120]],
    ['wall_brick.webp',  [160, 80,  50]],
    ['wall_wood.webp',   [140, 100, 60]],
    ['door.webp',        [100, 70,  40]],
    ['floor_tile.webp',  [90,  90,  90]],
    ['ceiling.webp',     [60,  60,  80]],
  ];

  await Promise.all(
    placeholders.map(([name, [r, g, b]]) =>
      sharp({
        create: { width: 64, height: 64, channels: 3, background: { r, g, b } },
      })
        .webp()
        .toFile(path.join(texDir, name))
    )
  );

  // Placeholder health faces (6 states)
  const portraitsDir = path.join(root, 'assets', 'sprites', 'player_portraits');
  const faces: [string, [number, number, number]][] = [
    ['face_100.webp', [230, 190, 140]],
    ['face_80.webp',  [220, 170, 120]],
    ['face_60.webp',  [200, 140, 100]],
    ['face_40.webp',  [180, 110, 80]],
    ['face_20.webp',  [160, 80,  60]],
    ['face_0.webp',   [80,  40,  40]],
  ];
  await Promise.all(
    faces.map(([name, [r, g, b]]) =>
      sharp({
        create: { width: 48, height: 48, channels: 3, background: { r, g, b } },
      })
        .webp()
        .toFile(path.join(portraitsDir, name))
    )
  );
}
