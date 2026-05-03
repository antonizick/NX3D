#!/usr/bin/env npx tsx
/**
 * Generates pixel-art placeholder sprites for enemies, weapons, items, and projectiles.
 * All sprites are RGBA WebP — transparent background, opaque figure.
 * The renderer skips alpha=0 pixels so the transparent background is invisible.
 *
 * Run: npx tsx packages/server/generateSpriteAssets.ts
 */
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';

const REPO_ROOT   = path.resolve(import.meta.dirname, '../..');
const TENANTS_DIR = path.join(REPO_ROOT, 'tenants');
const DEFAULTS    = path.join(TENANTS_DIR, '_defaults');
const W = 64, H = 64;

// ─── Pixel helpers ────────────────────────────────────────────────────────────

type C4 = readonly [number, number, number, number]; // RGBA

function mkbuf(): Buffer { return Buffer.alloc(W * H * 4, 0); }

function set(b: Buffer, x: number, y: number, c: C4): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) << 2;
  b[i] = c[0]; b[i+1] = c[1]; b[i+2] = c[2]; b[i+3] = c[3];
}

function fill(b: Buffer, x1: number, y1: number, x2: number, y2: number, c: C4): void {
  for (let y = Math.max(0, y1); y <= Math.min(H-1, y2); y++)
    for (let x = Math.max(0, x1); x <= Math.min(W-1, x2); x++)
      set(b, x, y, c);
}

function disk(b: Buffer, cx: number, cy: number, r: number, c: C4): void {
  for (let y = cy-r; y <= cy+r; y++)
    for (let x = cx-r; x <= cx+r; x++)
      if ((x-cx)**2+(y-cy)**2 <= r*r) set(b, x, y, c);
}

function flipH(src: Buffer): Buffer {
  const dst = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const si = (y*W+x)*4, di = (y*W+(W-1-x))*4;
      dst[di]=src[si]; dst[di+1]=src[si+1]; dst[di+2]=src[si+2]; dst[di+3]=src[si+3];
    }
  return dst;
}

async function saveSprite(b: Buffer, outPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp(b, { raw: { width: W, height: H, channels: 4 } })
    .webp({ quality: 90 })
    .toFile(outPath);
  console.log(`  ✓ ${path.relative(REPO_ROOT, outPath)}`);
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const TR:   C4 = [0,   0,   0,   0  ];
const SKIN: C4 = [210, 165, 125, 255];
const HAT:  C4 = [55,  68,  40,  255];
const UNI:  C4 = [88,  80,  56,  255];
const BELT: C4 = [45,  35,  22,  255];
const BOOT: C4 = [38,  30,  20,  255];
const DARK: C4 = [25,  20,  15,  255];
const GUN:  C4 = [52,  52,  52,  255];
const FLAS: C4 = [255, 200, 55,  255];
const HAIR: C4 = [55,  40,  25,  255];
const BLOD: C4 = [165, 18,  18,  255];

// ─── Guard enemy ─────────────────────────────────────────────────────────────

// angle 5→3, 6→2, 7→1 (mirror)
const MIRROR_SRC  = [0, 1, 2, 3, 4, 3, 2, 1];
const SHOULD_MIR  = [false, false, false, false, false, true, true, true];

// Walk leg offsets: [leftYOff, rightYOff]
const WALK_LOFF: [number,number][] = [[0,0],[3,-3],[0,0],[-3,3]];

function drawGuardBase(srcAngle: number, state: string, frame: number): Buffer {
  if (state === 'death') return drawDeath(frame);

  const b  = mkbuf();
  const cx = 32;

  const wf   = srcAngle === 2 ? 0.28 : (srcAngle === 1 || srcAngle === 3) ? 0.72 : 1.0;
  const side = srcAngle === 2;

  const bw = Math.max(2, Math.round(9 * wf));
  const hh = side ? 7 : Math.max(3, Math.round(7 * wf));
  const aw = Math.max(1, Math.round(3.5 * wf));
  const ao = Math.round(13 * wf);
  const lw = Math.max(1, Math.round(3.5 * wf));
  const lo = side ? 0 : Math.max(2, Math.round(4 * wf));

  const showFace = srcAngle <= 1;
  const showBack = srcAngle >= 3;

  const [llOff, rlOff] = (state === 'walk') ? WALK_LOFF[frame % 4]! : [0, 0];
  const attackRaised = state === 'attack' && showFace;

  // ── Right / back leg ──────────────────────────────────────────────────────
  if (!side) {
    const ry1 = 39 + rlOff, ry2 = 55 + rlOff;
    fill(b, cx+lo-lw, ry1,   cx+lo+lw, ry2,   UNI);
    fill(b, cx+lo-lw-1, ry2, cx+lo+lw+1, ry2+4, BOOT);
  }

  // ── Body ──────────────────────────────────────────────────────────────────
  fill(b, cx - Math.round(11*wf), 22, cx + Math.round(11*wf), 25, UNI); // shoulders
  fill(b, cx-bw, 24, cx+bw, 38, UNI);
  fill(b, cx-bw, 35, cx+bw, 38, BELT);

  // ── Right arm (back arm, drawn before front elements) ────────────────────
  const raY1 = attackRaised ? 13 : 22;
  fill(b, cx+ao-aw, raY1, cx+ao+aw, 37, UNI);
  if (attackRaised) {
    fill(b, cx+ao-1, raY1-6, cx+ao+2, raY1, GUN);   // gun barrel
    if (frame === 1) disk(b, cx+ao+1, raY1-8, 3, FLAS); // muzzle flash
  }

  // ── Left / front leg ─────────────────────────────────────────────────────
  const ly1 = 39 + llOff, ly2 = 55 + llOff;
  const lx  = side ? cx : cx - lo;
  fill(b, lx-lw, ly1,   lx+lw, ly2,   UNI);
  fill(b, lx-lw-1, ly2, lx+lw+1, ly2+4, BOOT);

  // ── Neck + head ───────────────────────────────────────────────────────────
  fill(b, cx-2, 20, cx+2, 23, SKIN);
  fill(b, cx-hh, 10, cx+hh, 21, SKIN);
  set(b, cx-hh, 10, TR); set(b, cx+hh, 10, TR);
  set(b, cx-hh, 21, TR); set(b, cx+hh, 21, TR);

  // ── Hat ───────────────────────────────────────────────────────────────────
  const hatHW = Math.max(2, Math.round(8*wf));
  fill(b, cx-hatHW, 4, cx+hatHW, 11, HAT);
  fill(b, cx - Math.round(hatHW*1.35), 10, cx + Math.round(hatHW*1.35), 13, HAT);

  // ── Face / hair ───────────────────────────────────────────────────────────
  if (showFace) {
    const eo = Math.max(1, Math.round(3*wf));
    fill(b, cx-eo-1, 13, cx-eo+1, 14, DARK); // left eye
    fill(b, cx+eo-1, 13, cx+eo+1, 14, DARK); // right eye
    fill(b, cx-2, 18, cx+2, 18, DARK);        // mouth
    if (state === 'pain') fill(b, cx-3, 17, cx+3, 18, BLOD);
  } else if (showBack) {
    fill(b, cx - Math.round(4*wf), 12, cx + Math.round(4*wf), 17, HAIR);
  }

  // ── Left arm (front arm, drawn last) ─────────────────────────────────────
  if (!side) fill(b, cx-ao-aw, 22, cx-ao+aw, 37, UNI);

  if (state === 'pain') fill(b, cx-2, 22, cx+2, 25, BLOD);

  return b;
}

function drawDeath(frame: number): Buffer {
  const b = mkbuf(), cx = 32;
  switch (frame) {
    case 0:
      fill(b, cx-8,  5,  cx+8,  12, HAT);
      fill(b, cx-10, 11, cx+10, 13, HAT);
      fill(b, cx-6,  12, cx+6,  21, SKIN);
      fill(b, cx-8,  22, cx+8,  38, UNI);
      fill(b, cx-8,  35, cx+8,  38, BELT);
      fill(b, cx-16, 12, cx-9,  28, UNI);
      fill(b, cx+9,  12, cx+16, 28, UNI);
      fill(b, cx-7,  38, cx-2,  55, UNI);
      fill(b, cx+2,  38, cx+7,  55, UNI);
      fill(b, cx-8,  54, cx-1,  59, BOOT);
      fill(b, cx+1,  54, cx+8,  59, BOOT);
      fill(b, cx-2,  22, cx+3,  24, BLOD);
      break;
    case 1:
      fill(b, cx-7,  8,  cx+9,  14, HAT);
      fill(b, cx-5,  14, cx+8,  24, SKIN);
      fill(b, cx-7,  24, cx+9,  38, UNI);
      fill(b, cx-7,  36, cx+9,  38, BELT);
      fill(b, cx-16, 22, cx-8,  37, UNI);
      fill(b, cx+9,  18, cx+16, 34, UNI);
      fill(b, cx-6,  39, cx-1,  56, UNI);
      fill(b, cx+2,  38, cx+8,  53, UNI);
      fill(b, cx-8,  54, cx-0,  59, BOOT);
      fill(b, cx+2,  51, cx+9,  57, BOOT);
      break;
    case 2:
      fill(b, cx-6,  14, cx+8,  19, HAT);
      fill(b, cx-5,  19, cx+7,  28, SKIN);
      fill(b, cx-7,  29, cx+8,  41, UNI);
      fill(b, cx-7,  39, cx+8,  41, BELT);
      fill(b, cx-15, 30, cx-8,  45, UNI);
      fill(b, cx+9,  28, cx+15, 44, UNI);
      fill(b, cx-8,  42, cx,    55, UNI);
      fill(b, cx,    42, cx+8,  55, UNI);
      fill(b, cx-11, 53, cx+1,  58, BOOT);
      fill(b, cx,    53, cx+11, 58, BOOT);
      fill(b, cx-3,  28, cx+5,  30, BLOD);
      break;
    case 3:
      fill(b, cx-9,  22, cx+11, 29, HAT);
      fill(b, cx-8,  29, cx+10, 38, SKIN);
      fill(b, cx-12, 37, cx+14, 47, UNI);
      fill(b, cx-10, 45, cx+2,  55, UNI);
      fill(b, cx+2,  43, cx+14, 53, UNI);
      fill(b, cx-14, 53, cx+16, 59, BOOT);
      fill(b, cx-6,  33, cx+8,  36, BLOD);
      break;
    case 4:
      fill(b, cx-16, 44, cx+16, 50, UNI);
      fill(b, cx-12, 42, cx+13, 46, HAT);
      fill(b, cx-10, 46, cx+10, 53, SKIN);
      fill(b, cx-18, 49, cx+18, 58, BOOT);
      fill(b, cx-8,  44, cx+9,  49, BLOD);
      break;
  }
  return b;
}

function guardSprite(angle: number, state: string, frame: number): Buffer {
  const src = MIRROR_SRC[angle]!;
  const b   = drawGuardBase(src, state, frame);
  return SHOULD_MIR[angle] ? flipH(b) : b;
}

// ─── Weapon sprites ───────────────────────────────────────────────────────────

// Weapon sprites appear in lower ~40% of frame; transparent above.
// yBase controls vertical position: higher frame number = gun raised (recoil peak at frame 2).

const HAND: C4 = [190, 145, 108, 255];
const TRIG: C4 = [65,  55,  45,  255]; // trigger guard

function pistolSprite(frame: number): Buffer {
  const b = mkbuf();
  // yBase: frame 0=raised0, 1=raised1, 2=highest (fire), 3=recoil, 4=lower
  const yOff = [8, 5, 2, 7, 8][frame]!;

  const gripY1 = 42 + yOff, gripY2 = 58 + yOff;
  const barY1  = 30 + yOff, barY2  = 44 + yOff;

  // Hands (left at 18-28, right at 34-46)
  fill(b, 18, gripY1, 28, gripY2, HAND);
  fill(b, 34, gripY1, 46, gripY2, HAND);

  // Gun grip / frame
  fill(b, 28, gripY1, 38, gripY2, GUN);
  fill(b, 30, barY2-4, 36, gripY1, TRIG);

  // Barrel
  fill(b, 32, barY1, 37, barY2, GUN);

  // Muzzle flash on frame 2
  if (frame === 2) {
    disk(b, 35, barY1-3, 5, FLAS);
    disk(b, 35, barY1-3, 2, [255, 255, 200, 255]);
  }

  return b;
}

function knifeSprite(frame: number): Buffer {
  const b = mkbuf();
  // frame 0=idle, 1=wind-up, 2=slash extended, 3=return
  const yOff  = [10, 6, 2, 8][frame]!;
  const xOff  = [0, -4, 6, 2][frame]!;

  // Hand
  fill(b, 32+xOff, 48+yOff, 44+xOff, 62+yOff, HAND);

  // Blade (diagonal for frames 1-2)
  if (frame <= 1) {
    // Vertical blade
    fill(b, 36+xOff, 30+yOff, 40+xOff, 50+yOff, [200, 200, 210, 255]);
    fill(b, 37+xOff, 28+yOff, 39+xOff, 32+yOff, [220, 220, 230, 255]); // tip
    fill(b, 35+xOff, 30+yOff, 37+xOff, 50+yOff, [150, 150, 160, 255]); // edge shadow
  } else {
    // Angled blade for slash
    for (let i = 0; i < 20; i++) {
      const bx = 26 + xOff + i;
      const by = 44 + yOff - i;
      fill(b, bx, by, bx+3, by+3, [200, 200, 210, 255]);
    }
    fill(b, 44+xOff, 26+yOff, 48+xOff, 30+yOff, [220, 220, 230, 255]); // tip
  }

  // Guard
  fill(b, 30+xOff, 48+yOff, 46+xOff, 52+yOff, [80, 70, 55, 255]);

  return b;
}

// ─── Item sprites ─────────────────────────────────────────────────────────────

const GOLD:  C4 = [230, 185, 30,  255];
const GOLDD: C4 = [180, 130, 10,  255];
const SILV:  C4 = [190, 195, 200, 255];
const SILVD: C4 = [140, 145, 155, 255];
const RED:   C4 = [210, 30,  30,  255];
const WHITE: C4 = [240, 240, 235, 255];
const GREEN: C4 = [30,  180, 50,  255];
const GRNDK: C4 = [15,  120, 30,  255];
const BRWN:  C4 = [160, 100, 50,  255];
const BRWNL: C4 = [200, 145, 80,  255];
const GRAY:  C4 = [130, 130, 135, 255];
const GRAYD: C4 = [85,  85,  90,  255];

function medkitSprite(): Buffer {
  const b = mkbuf(), cx = 32, cy = 32;
  fill(b, cx-14, cy-12, cx+14, cy+14, WHITE);
  fill(b, cx-14, cy-12, cx+14, cy-10, [180,180,175,255]); // top shade
  fill(b, cx-5,  cy-10, cx+5,  cy+12, RED);  // vertical bar
  fill(b, cx-12, cy-1,  cx+12, cy+5,  RED);  // horizontal bar
  // Border
  fill(b, cx-14, cy-12, cx-13, cy+14, [160,160,155,255]);
  fill(b, cx+13, cy-12, cx+14, cy+14, [160,160,155,255]);
  fill(b, cx-14, cy+13, cx+14, cy+14, [160,160,155,255]);
  return b;
}

function foodSprite(): Buffer {
  const b = mkbuf(), cx = 32, cy = 34;
  // Chicken leg: oval body + stick bone
  disk(b, cx-2, cy, 12, BRWNL);
  disk(b, cx-2, cy, 10, BRWN);
  disk(b, cx-2, cy-2, 8, BRWNL);
  // Bone stick
  fill(b, cx+8,  cy-2, cx+18, cy+2,  [220, 210, 195, 255]);
  disk(b, cx+18, cy,   4, [220, 210, 195, 255]);
  disk(b, cx+18, cy,   2, [240, 235, 225, 255]);
  return b;
}

function ammoSprite(): Buffer {
  const b = mkbuf(), cx = 32, cy = 34;
  // Ammo box
  fill(b, cx-14, cy-10, cx+14, cy+10, GRAY);
  fill(b, cx-13, cy-9,  cx+13, cy+9,  GRAYD);
  // Diagonal stripes (ammo pattern)
  for (let i = 0; i < 5; i++) {
    fill(b, cx-10+i*5, cy-8, cx-8+i*5, cy+8, GRAY);
  }
  // Label band
  fill(b, cx-13, cy-2, cx+13, cy+2, [80,80,85,255]);
  // Individual bullet outlines
  for (let i = 0; i < 5; i++) {
    const bx = cx-11+i*5;
    fill(b, bx, cy-8, bx+2, cy-4, [200,180,90,255]);
  }
  return b;
}

function keySprite(isGold: boolean): Buffer {
  const b   = mkbuf(), cx = 32;
  const col  = isGold ? GOLD  : SILV;
  const colD = isGold ? GOLDD : SILVD;
  // Key bow (ring)
  disk(b, cx, 22, 9, col);
  disk(b, cx, 22, 6, colD);
  disk(b, cx, 22, 3, [0,0,0,0]); // hole
  // Key shaft
  fill(b, cx-2, 29, cx+2, 52, col);
  // Key teeth
  fill(b, cx-6, 44, cx-2, 46, col);
  fill(b, cx-6, 49, cx-2, 51, col);
  fill(b, cx+2, 41, cx+6, 43, col);
  return b;
}

function treasureCross(): Buffer {
  const b = mkbuf(), cx = 32;
  fill(b, cx-3, 16, cx+3, 52, GOLD);   // vertical arm
  fill(b, cx-3, 16, cx+3, 52, GOLDD);  // center shadow strip
  fill(b, cx-3, 17, cx+3, 51, GOLD);
  fill(b, cx-14, 24, cx+14, 30, GOLD); // horizontal arm
  fill(b, cx-14, 25, cx+14, 29, GOLDD);
  fill(b, cx-14, 26, cx+14, 28, GOLD);
  return b;
}

function treasureChalice(): Buffer {
  const b = mkbuf(), cx = 32;
  // Cup (trapezoid wider at top)
  for (let y = 15; y <= 34; y++) {
    const hw = Math.round(10 - (y-15) * 0.2);
    fill(b, cx-hw, y, cx+hw, y, GOLD);
  }
  // Stem
  fill(b, cx-2, 34, cx+2, 46, GOLD);
  // Base
  fill(b, cx-10, 46, cx+10, 50, GOLD);
  fill(b, cx-8,  50, cx+8,  52, GOLDD);
  // Gem highlight
  disk(b, cx, 22, 3, [255, 240, 120, 255]);
  return b;
}

function treasureCrown(): Buffer {
  const b = mkbuf(), cx = 32;
  // Base band
  fill(b, cx-13, 40, cx+13, 50, GOLD);
  fill(b, cx-13, 42, cx+13, 48, GOLDD);
  fill(b, cx-13, 44, cx+13, 46, GOLD);
  // Three crown points
  fill(b, cx-12, 24, cx-8,  40, GOLD); // left point
  fill(b, cx-3,  18, cx+3,  40, GOLD); // center point
  fill(b, cx+8,  24, cx+12, 40, GOLD); // right point
  // Gems on points
  disk(b, cx-10, 24, 2, RED);
  disk(b, cx,    18, 2, [60, 60, 220, 255]);
  disk(b, cx+10, 24, 2, RED);
  return b;
}

function oneupSprite(): Buffer {
  const b = mkbuf(), cx = 32, cy = 32;
  // Green star / extra life symbol
  disk(b, cx, cy, 16, GREEN);
  disk(b, cx, cy, 13, GRNDK);
  disk(b, cx, cy, 11, GREEN);
  // "1" shape in center
  fill(b, cx-1, cy-8, cx+3, cy+9, WHITE);
  fill(b, cx-3, cy+7, cx+5, cy+9, WHITE);
  fill(b, cx-1, cy-8, cx+3, cy-6, WHITE);
  // Small star points
  fill(b, cx-16, cy-2, cx-10, cy+2, GREEN);
  fill(b, cx+10, cy-2, cx+16, cy+2, GREEN);
  fill(b, cx-2,  cy-16, cx+2, cy-10, GREEN);
  fill(b, cx-2,  cy+10, cx+2, cy+16, GREEN);
  return b;
}

// ─── Exit / Elevator sprite ───────────────────────────────────────────────────

const STEEL:  C4 = [140, 145, 155, 255];
const STEELD: C4 = [90,  95,  105, 255];
const STEELL: C4 = [175, 180, 190, 255];
const SEAM:   C4 = [40,  40,  45,  255];
const PANELB: C4 = [55,  60,  70,  255];
const BTNLIT: C4 = [255, 230, 80,  255];
const BTNOFF: C4 = [100, 90,  60,  255];
const TRIM:   C4 = [70,  75,  85,  255];

function elevatorSprite(): Buffer {
  const b = mkbuf();

  // Floor trim
  fill(b, 6, 56, 57, 62, TRIM);

  // Left door panel
  fill(b, 6,  8, 30, 55, STEEL);
  fill(b, 6,  8,  8, 55, STEELD); // left shadow
  fill(b, 6,  8, 30, 10, STEELL); // top highlight
  // Recessed inset on left panel
  fill(b, 11, 16, 27, 48, STEELD);
  fill(b, 12, 17, 26, 47, STEEL);

  // Right door panel
  fill(b, 33, 8, 57, 55, STEEL);
  fill(b, 55, 8, 57, 55, STEELD); // right shadow
  fill(b, 33, 8, 57, 10, STEELL); // top highlight
  // Recessed inset on right panel
  fill(b, 36, 16, 52, 48, STEELD);
  fill(b, 37, 17, 51, 47, STEEL);

  // Center seam
  fill(b, 31, 8, 32, 55, SEAM);

  // Control panel box (right side, between panel and edge)
  fill(b, 59, 18, 63, 46, PANELB);
  // Call button (lit up — player is here)
  disk(b, 61, 26, 3, BTNLIT);
  disk(b, 61, 26, 1, [255, 255, 200, 255]);
  // Floor indicator dot above button
  disk(b, 61, 20, 2, BTNOFF);

  return b;
}

// ─── Projectile sprite ────────────────────────────────────────────────────────

function projectileSprite(): Buffer {
  const b = mkbuf(), cx = 32, cy = 32;
  disk(b, cx, cy, 8,  [255, 160, 30, 255]); // outer glow
  disk(b, cx, cy, 5,  [255, 220, 80, 255]); // mid
  disk(b, cx, cy, 3,  [255, 255, 180, 255]); // bright core
  return b;
}

// ─── Write all sprites to a directory tree ────────────────────────────────────

async function writeSprites(root: string): Promise<void> {
  const guardDir  = path.join(root, 'sprites', 'enemies', 'guard');
  const pistolDir = path.join(root, 'sprites', 'weapons', 'pistol');
  const knifeDir  = path.join(root, 'sprites', 'weapons', 'knife');
  const itemsDir  = path.join(root, 'sprites', 'items');
  const projDir   = path.join(root, 'sprites', 'projectiles');

  // Guard: walk (8 angles × 4 frames), attack (8 angles × 2 frames), death (5), pain (1)
  for (let a = 0; a < 8; a++) {
    for (let f = 0; f < 4; f++)
      await saveSprite(guardSprite(a, 'walk', f),   path.join(guardDir, `walk_${a}_${f}.webp`));
    for (let f = 0; f < 2; f++)
      await saveSprite(guardSprite(a, 'attack', f), path.join(guardDir, `attack_${a}_${f}.webp`));
  }
  for (let f = 0; f < 5; f++)
    await saveSprite(guardSprite(0, 'death', f), path.join(guardDir, `death_${f}.webp`));
  await saveSprite(guardSprite(0, 'pain', 0), path.join(guardDir, 'pain_0.webp'));

  // Weapons
  for (let f = 0; f < 5; f++)
    await saveSprite(pistolSprite(f), path.join(pistolDir, `${f}.webp`));
  for (let f = 0; f < 4; f++)
    await saveSprite(knifeSprite(f), path.join(knifeDir, `${f}.webp`));

  // Items
  await saveSprite(medkitSprite(),      path.join(itemsDir, 'medkit.webp'));
  await saveSprite(foodSprite(),        path.join(itemsDir, 'food.webp'));
  await saveSprite(ammoSprite(),        path.join(itemsDir, 'ammo_clip.webp'));
  await saveSprite(keySprite(true),     path.join(itemsDir, 'key_gold.webp'));
  await saveSprite(keySprite(false),    path.join(itemsDir, 'key_silver.webp'));
  await saveSprite(treasureCross(),     path.join(itemsDir, 'treasure1.webp'));
  await saveSprite(treasureChalice(),   path.join(itemsDir, 'treasure2.webp'));
  await saveSprite(treasureCrown(),     path.join(itemsDir, 'treasure3.webp'));
  await saveSprite(oneupSprite(),       path.join(itemsDir, 'oneup.webp'));
  await saveSprite(elevatorSprite(),   path.join(itemsDir, 'exit.webp'));

  // Projectile
  await saveSprite(projectileSprite(), path.join(projDir, 'projectile.webp'));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n── Writing _defaults ──────────────────────────────────────');
  await writeSprites(path.join(DEFAULTS, 'assets'));

  const entries = await fs.readdir(TENANTS_DIR);
  for (const entry of entries) {
    if (entry.startsWith('_')) continue;
    const tenantRoot = path.join(TENANTS_DIR, entry);
    try {
      const stat = await fs.stat(tenantRoot);
      if (!stat.isDirectory()) continue;
    } catch { continue; }

    console.log(`\n── Updating tenant ${entry} ──────────────────────────────`);
    await writeSprites(path.join(tenantRoot, 'assets'));
  }

  console.log('\nDone.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
