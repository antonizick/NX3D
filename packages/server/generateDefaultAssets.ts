#!/usr/bin/env npx tsx
/**
 * Generates pixel-art default textures and HUD portraits for CustomWolf.
 *
 * Run once (from repo root or server package):
 *   npx tsx packages/server/generateDefaultAssets.ts
 *
 * Writes to:
 *   tenants/_defaults/assets/textures/        ← future tenants get these via copyDir
 *   tenants/_defaults/assets/sprites/player_portraits/
 *   tenants/<uuid>/assets/textures/            ← all existing tenants updated
 *   tenants/<uuid>/assets/sprites/player_portraits/
 */
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';

const REPO_ROOT   = path.resolve(import.meta.dirname, '../..');
const TENANTS_DIR = path.join(REPO_ROOT, 'tenants');
const DEFAULTS    = path.join(TENANTS_DIR, '_defaults');

// ─── Pixel helpers ────────────────────────────────────────────────────────────

type RGB = [number, number, number];

function clamp(v: number): number { return Math.max(0, Math.min(255, Math.round(v))); }
function rgb(r: number, g: number, b: number): RGB { return [clamp(r), clamp(g), clamp(b)]; }

/** Deterministic hash → [0, 1) */
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Build a W×H 3-channel raw buffer. */
function buildBuf(W: number, H: number, fn: (x: number, y: number) => RGB): Buffer {
  const buf = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * W + x) * 3;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
    }
  }
  return buf;
}

function fill(buf: Buffer, W: number, H: number,
  x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = (y * W + x) * 3;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    }
  }
}

function setPixel(buf: Buffer, W: number, H: number, x: number, y: number, c: RGB): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}

async function saveBuf(buf: Buffer, W: number, H: number, outPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .webp({ quality: 90 })
    .toFile(outPath);
}

// ─── Texture generators (64×64) ───────────────────────────────────────────────

const TEX = 64;

function stoneWall(): Buffer {
  const BW = 16, BH = 8, MORTAR = 2;
  return buildBuf(TEX, TEX, (x, y) => {
    const row = Math.floor(y / BH);
    const off = (row % 2) * (BW / 2);
    const lx  = (x + off) % BW;
    const ly  = y % BH;
    if (lx < MORTAR || ly < MORTAR) return rgb(72, 68, 64);
    const bx = Math.floor((x + off) / BW);
    const v  = Math.round((hash(bx * 3 + 1, row * 7 + 2) - 0.5) * 20);
    return rgb(128 + v, 123 + v, 116 + v);
  });
}

function brickWall(): Buffer {
  const BW = 16, BH = 8, MORTAR = 2;
  return buildBuf(TEX, TEX, (x, y) => {
    const row = Math.floor(y / BH);
    const off = (row % 2) * (BW / 2);
    const lx  = (x + off) % BW;
    const ly  = y % BH;
    if (lx < MORTAR || ly < MORTAR) return rgb(182, 162, 142);
    const bx = Math.floor((x + off) / BW);
    const v  = Math.round((hash(bx * 5 + 1, row * 11 + 3) - 0.5) * 22);
    return rgb(168 + v, 68 + v / 2, 42 + v / 2);
  });
}

function woodPanel(): Buffer {
  const PW = 16;
  return buildBuf(TEX, TEX, (x, y) => {
    const plank = Math.floor(x / PW);
    const lx    = x % PW;
    if (lx === 0 || lx === 1) return rgb(75, 50, 25);          // joint
    const dark  = y % 7 === 3 || y % 11 === 8;                 // grain line
    const base  = plank % 2 === 0 ? 148 : 132;
    const jit   = Math.round((hash(x, y) - 0.5) * 8);
    const d     = dark ? -18 : 0;
    return rgb(base + d + jit, (base * 0.65) + d + jit, (base * 0.37) + d);
  });
}

function door(): Buffer {
  const FRAME = 4, MID = 31, GROOVE = 2;
  return buildBuf(TEX, TEX, (x, y) => {
    // frame border
    if (x < FRAME || x >= TEX - FRAME || y < FRAME || y >= TEX - FRAME)
      return rgb(85, 55, 25);
    // center vertical divider
    if (x >= MID - 1 && x <= MID + 1) return rgb(92, 60, 28);
    // top/bottom panel groove
    const iy = y - FRAME, ih = TEX - FRAME * 2;
    if (iy < GROOVE || iy >= ih - GROOVE) return rgb(92, 60, 28);
    // bevel: lighter near top-edge, darker near bottom-edge of each panel half
    const half = ih / 2;
    const inTop = iy < half - GROOVE;
    const nearTopEdge   = iy < GROOVE * 2 + 2;
    const nearBotEdge   = iy >= ih - GROOVE * 2 - 2;
    const nearHalfTop   = iy >= half - GROOVE - 2 && iy < half - GROOVE;
    const nearHalfBot   = iy >= half + GROOVE && iy < half + GROOVE + 2;
    const bevel = (nearTopEdge || nearHalfBot)  ?  18
                : (nearBotEdge || nearHalfTop)   ? -18
                : 0;
    const jit = Math.round((hash(x, y) - 0.5) * 6);
    return rgb(152 + bevel + jit, 102 + bevel + jit, 55 + bevel);
  });
}

function floorTile(): Buffer {
  const TILE = 8, GROUT = 1;
  return buildBuf(TEX, TEX, (x, y) => {
    if (x % TILE < GROUT || y % TILE < GROUT) return rgb(50, 48, 45);
    const tx  = Math.floor(x / TILE);
    const ty  = Math.floor(y / TILE);
    const alt = (tx + ty) % 2;
    const base = alt ? 90 : 80;
    const jit  = Math.round((hash(tx * 7 + 1, ty * 13 + 5) - 0.5) * 12);
    return rgb(base + jit, base - 2 + jit, base - 5 + jit);
  });
}

function ceilingTex(): Buffer {
  const BEAM = 16, BW = 3;
  return buildBuf(TEX, TEX, (x, y) => {
    if (x % BEAM < BW || y % BEAM < BW) return rgb(162, 155, 138);
    const jit = Math.round((hash(x, y) - 0.5) * 8);
    return rgb(196 + jit, 190 + jit, 174 + jit);
  });
}

// ─── Portrait generators (48×48) ──────────────────────────────────────────────

const PW = 48, PH = 48;

// face_100, face_80, ... face_0
const HEALTH_LEVELS = [100, 80, 60, 40, 20, 0];

const SKIN_COLORS: RGB[] = [
  [222, 182, 140],
  [208, 165, 120],
  [188, 142, 100],
  [165, 112, 85],
  [138, 85, 68],
  [82, 42, 42],
];

function portrait(health: number): Buffer {
  const idx  = HEALTH_LEVELS.indexOf(health);
  const skin = SKIN_COLORS[idx];
  const dead = health === 0;

  const buf = Buffer.alloc(PW * PH * 3);

  const BG:     RGB = [48, 48, 52];   // helmet/background
  const HAIR:   RGB = [60, 42, 25];
  const WHITE:  RGB = [238, 238, 235];
  const PUPIL:  RGB = [25, 25, 28];
  const NOSE:   RGB = [clamp(skin[0] - 20), clamp(skin[1] - 18), clamp(skin[2] - 16)];
  const MOUTH:  RGB = health >= 80 ? [155, 65, 65]
                    : health >= 40  ? [130, 55, 55]
                    : [105, 35, 35];
  const TEETH:  RGB = [228, 225, 210];
  const BLOOD:  RGB = [175, 25, 25];

  // Background
  fill(buf, PW, PH, 0, 0, PW - 1, PH - 1, BG);

  // Helmet rim (slightly lighter border)
  const RIM: RGB = [68, 68, 72];
  fill(buf, PW, PH, 3, 3, PW - 4, 5, RIM);
  fill(buf, PW, PH, 3, PH - 6, PW - 4, PH - 4, RIM);
  fill(buf, PW, PH, 3, 3, 5, PH - 4, RIM);
  fill(buf, PW, PH, PW - 6, 3, PW - 4, PH - 4, RIM);

  // Face oval (roughly rectangular with corners)
  fill(buf, PW, PH, 9, 5, 38, 42, skin);
  // Round the four corners
  fill(buf, PW, PH, 9, 5, 10, 6, BG);
  fill(buf, PW, PH, 37, 5, 38, 6, BG);
  fill(buf, PW, PH, 9, 41, 10, 42, BG);
  fill(buf, PW, PH, 37, 41, 38, 42, BG);

  // Hair
  fill(buf, PW, PH, 9, 5, 38, 11, HAIR);
  // Receding at edges
  fill(buf, PW, PH, 9, 5, 11, 7, skin);
  fill(buf, PW, PH, 36, 5, 38, 7, skin);

  if (dead) {
    // X eyes
    for (let i = 0; i < 5; i++) {
      setPixel(buf, PW, PH, 13 + i, 17 + i, PUPIL);
      setPixel(buf, PW, PH, 17 - i, 17 + i, PUPIL);
      setPixel(buf, PW, PH, 28 + i, 17 + i, PUPIL);
      setPixel(buf, PW, PH, 32 - i, 17 + i, PUPIL);
    }
  } else {
    // Left eye
    fill(buf, PW, PH, 13, 17, 17, 21, WHITE);
    fill(buf, PW, PH, 15, 19, 16, 20, PUPIL);
    // Right eye
    fill(buf, PW, PH, 28, 17, 32, 21, WHITE);
    fill(buf, PW, PH, 30, 19, 31, 20, PUPIL);
  }

  // Nose
  fill(buf, PW, PH, 22, 25, 25, 26, NOSE);

  // Mouth
  if (health >= 80) {
    // Smile (up-turned corners)
    fill(buf, PW, PH, 16, 31, 31, 32, MOUTH);
    fill(buf, PW, PH, 14, 29, 15, 30, MOUTH);
    fill(buf, PW, PH, 32, 29, 33, 30, MOUTH);
  } else if (health >= 60) {
    // Neutral
    fill(buf, PW, PH, 16, 31, 31, 32, MOUTH);
  } else if (health >= 40) {
    // Slight frown
    fill(buf, PW, PH, 16, 31, 31, 32, MOUTH);
    fill(buf, PW, PH, 14, 32, 15, 33, MOUTH);
    fill(buf, PW, PH, 32, 32, 33, 33, MOUTH);
  } else {
    // Grimace with teeth
    fill(buf, PW, PH, 14, 32, 33, 33, MOUTH);
    fill(buf, PW, PH, 14, 33, 33, 35, TEETH);
    fill(buf, PW, PH, 14, 32, 15, 34, MOUTH);
    fill(buf, PW, PH, 32, 32, 33, 34, MOUTH);
  }

  // Blood splatter at very low health
  if (health <= 20) {
    fill(buf, PW, PH, 18, 7, 20, 13, BLOOD);
    fill(buf, PW, PH, 29, 9, 30, 15, BLOOD);
    if (health === 0) {
      fill(buf, PW, PH, 10, 20, 11, 25, BLOOD);
      fill(buf, PW, PH, 35, 18, 37, 23, BLOOD);
    }
  }

  return buf;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TEXTURES: [string, () => Buffer][] = [
  ['wall_stone.webp', stoneWall],
  ['wall_brick.webp', brickWall],
  ['wall_wood.webp',  woodPanel],
  ['door.webp',       door],
  ['floor_tile.webp', floorTile],
  ['ceiling.webp',    ceilingTex],
];

async function writeTextures(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  for (const [name, gen] of TEXTURES) {
    await saveBuf(gen(), TEX, TEX, path.join(dir, name));
    console.log(`  ✓ ${path.join(dir, name)}`);
  }
}

async function writePortraits(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  for (const h of HEALTH_LEVELS) {
    await saveBuf(portrait(h), PW, PH, path.join(dir, `face_${h}.webp`));
    console.log(`  ✓ ${path.join(dir, `face_${h}.webp`)}`);
  }
}

async function main(): Promise<void> {
  console.log('\n── Writing _defaults ──────────────────────────────────────');
  await writeTextures(path.join(DEFAULTS, 'assets', 'textures'));
  await writePortraits(path.join(DEFAULTS, 'assets', 'sprites', 'player_portraits'));

  const entries = await fs.readdir(TENANTS_DIR);
  for (const entry of entries) {
    if (entry.startsWith('_')) continue;
    const tenantRoot = path.join(TENANTS_DIR, entry);
    try {
      const stat = await fs.stat(tenantRoot);
      if (!stat.isDirectory()) continue;
    } catch { continue; }

    console.log(`\n── Updating tenant ${entry} ────────────────────────────────`);
    await writeTextures(path.join(tenantRoot, 'assets', 'textures'));
    await writePortraits(path.join(tenantRoot, 'assets', 'sprites', 'player_portraits'));
  }

  console.log('\nDone.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
