/**
 * Canvas renderer — writes directly to ImageData for maximum performance.
 *
 * Pipeline each frame:
 *  1. Floor / ceiling fill  (solid colour fallback, or textured floor-cast)
 *  2. Wall strips from raycaster
 *  3. Sprites (enemies + items) sorted back-to-front with Z-buffer
 *  4. Weapon bob
 */
import type { Player } from './Player.ts';
import type { GameMap } from './Map.ts';
import type { Enemy } from './Enemy.ts';
import type { Projectile } from './Projectile.ts';
import { Raycaster }       from './Raycaster.ts';
import type { TenantConfig } from '../types/index.ts';

// ─── Colour helpers (little-endian RGBA as Uint32) ────────────────────────────
function rgba(r: number, g: number, b: number, a = 255): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
function darken(c: number, f: number): number {
  return rgba(
    Math.floor((c & 0xff) * f),
    Math.floor(((c >>> 8)  & 0xff) * f),
    Math.floor(((c >>> 16) & 0xff) * f),
    (c >>> 24) & 0xff
  );
}
function hexToRgba(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgba((n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

export interface SpriteEntry {
  x: number; y: number;
  textureKey: string;
  scale?: number;
}

export class Renderer {
  private ctx:       CanvasRenderingContext2D;
  private imageData: ImageData;
  private pixels:    Uint32Array;
  private raycaster: Raycaster;
  private textures:  Map<string, Uint32Array> = new Map();

  private skyColour:   number;
  private floorColour: number;

  constructor(
    private canvas: HTMLCanvasElement,
    private sw: number,
    private sh: number,
    private cfg: TenantConfig,
    private tenantId: string,
    private texSize: number = 64
  ) {
    this.ctx       = canvas.getContext('2d')!;
    this.imageData = this.ctx.createImageData(sw, sh);
    this.pixels    = new Uint32Array(this.imageData.data.buffer);
    this.raycaster = new Raycaster(sw, sh, this.texSize);
    this.skyColour   = hexToRgba(cfg.theme.skyColor);
    this.floorColour = hexToRgba(cfg.theme.floorColor);
  }

  /** Load all wall textures from the server. */
  async loadTextures(): Promise<void> {
    const promises = this.cfg.textures.map(async t => {
      const url = `/assets/${this.tenantId}/assets/textures/${t.path}`;
      const tex = await this.fetchTexture(url);
      this.textures.set(t.id, tex ?? this.makeCheckerboard());
    });
    await Promise.all(promises);
  }

  /** Load a sprite texture by key, e.g. "guard/walk_0_0" */
  async loadSpriteTexture(key: string, url: string): Promise<void> {
    const tex = await this.fetchTexture(url);
    this.textures.set(key, tex ?? this.makeCheckerboard());
  }

  private async fetchTexture(url: string): Promise<Uint32Array | null> {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      await new Promise<void>((res, rej) => {
        img.onload  = () => res();
        img.onerror = () => rej(new Error(`Failed to load: ${url}`));
      });
      const oc  = new OffscreenCanvas(this.texSize, this.texSize);
      const ctx = oc.getContext('2d')!;
      ctx.drawImage(img, 0, 0, this.texSize, this.texSize);
      const id  = ctx.getImageData(0, 0, this.texSize, this.texSize);
      return new Uint32Array(id.data.buffer);
    } catch {
      return null;
    }
  }

  /** Try primaryUrl; if it fails, use fallbackUrl; checkerboard if both fail. */
  async loadSpriteTextureWithFallback(key: string, url: string, fallbackUrl: string): Promise<void> {
    const tex = await this.fetchTexture(url) ?? await this.fetchTexture(fallbackUrl);
    this.textures.set(key, tex ?? this.makeCheckerboard());
  }

  private makeCheckerboard(): Uint32Array {
    const tex = new Uint32Array(this.texSize * this.texSize);
    for (let y = 0; y < this.texSize; y++) {
      for (let x = 0; x < this.texSize; x++) {
        const even = ((x >> 3) + (y >> 3)) & 1;
        tex[y * this.texSize + x] = even ? rgba(180, 0, 180) : rgba(80, 0, 80);
      }
    }
    return tex;
  }

  render(
    player: Player,
    map: GameMap,
    enemies: Enemy[],
    projectiles: Projectile[],
    items: SpriteEntry[] = [],
    weaponInfo?: { key: string; bobX: number; bobY: number }
  ): void {
    const { sw, sh, pixels } = this;

    // 1. Sky + floor
    const half = sh >> 1;
    pixels.fill(this.skyColour,   0,        half * sw);
    pixels.fill(this.floorColour, half * sw, sw * sh);

    // 2. Walls
    const strips = this.raycaster.castAll(player, map);
    const zBuffer = this.raycaster.zBuffer;

    for (let x = 0; x < sw; x++) {
      const strip = strips[x]!;
      const { texIndex, texX, side, drawStart, drawEnd, lineHeight } = strip;

      const tex = this.textures.get(String(texIndex));

      const step    = this.texSize / lineHeight;
      let   texPos  = (drawStart - sh / 2 + lineHeight / 2) * step;

      for (let y = drawStart; y <= drawEnd; y++) {
        const texY  = Math.min(this.texSize - 1, Math.floor(texPos) & (this.texSize - 1));
        texPos += step;

        let colour: number;
        if (tex) {
          colour = tex[texY * this.texSize + texX] ?? rgba(128, 128, 128);
        } else {
          colour = rgba(120, 80, 60);
        }
        // N/S walls are darker (shade illusion)
        if (side === 1) colour = darken(colour, 0.6);

        pixels[y * sw + x] = colour;
      }
    }

    // 3. Sprites (enemies + items) — sorted far-to-near
    const spritesToDraw: SpriteEntry[] = [];
    for (const e of enemies) {
      if (!e.isDead || !e.isFullyDead) {
        spritesToDraw.push({ x: e.x, y: e.y, textureKey: e.spriteKey, scale: e.manifest.isBoss ? 1.4 : 1 });
      }
    }
    for (const p of projectiles) {
      if (p.alive) spritesToDraw.push({ x: p.x, y: p.y, textureKey: p.textureKey, scale: 0.3 });
    }
    for (const item of items) {
      spritesToDraw.push(item);
    }

    this.drawSprites(spritesToDraw, player, zBuffer);

    // 4. Weapon sprite — drawn into pixel buffer so it scales with the game canvas
    if (weaponInfo) this.drawWeaponSprite(weaponInfo.key, weaponInfo.bobX, weaponInfo.bobY);

    // 5. Commit to canvas
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  private drawWeaponSprite(key: string, bobX: number, bobY: number): void {
    const tex = this.textures.get(key);
    if (!tex) return;

    const { sw, sh, pixels, texSize } = this;
    const wSize = Math.floor(sh / 2);

    const destX = Math.floor((sw - wSize) / 2 + bobX);
    const destY = Math.floor(sh - wSize + bobY);

    for (let sy = 0; sy < wSize; sy++) {
      const py = destY + sy;
      if (py < 0 || py >= sh) continue;
      const texY = Math.floor((sy / wSize) * texSize);

      for (let sx = 0; sx < wSize; sx++) {
        const px = destX + sx;
        if (px < 0 || px >= sw) continue;
        const texX = Math.floor((sx / wSize) * texSize);

        const colour = tex[texY * texSize + texX]!;
        if ((colour >>> 24) === 0) continue;
        pixels[py * sw + px] = colour;
      }
    }
  }

  private drawSprites(sprites: SpriteEntry[], player: Player, zBuffer: Float64Array): void {
    const { sw, sh, pixels } = this;

    // Sort by distance descending
    const withDist = sprites.map(s => {
      const dx = s.x - player.x; const dy = s.y - player.y;
      return { ...s, dist: dx * dx + dy * dy };
    }).sort((a, b) => b.dist - a.dist);

    for (const sprite of withDist) {
      const dx = sprite.x - player.x;
      const dy = sprite.y - player.y;

      // Transform by inverse camera matrix
      const invDet = 1 / (player.planeX * player.dirY - player.dirX * player.planeY);
      const transformX = invDet * ( player.dirY  * dx - player.dirX  * dy);
      const transformY = invDet * (-player.planeY * dx + player.planeX * dy);

      if (transformY <= 0.05) continue; // behind or too close

      const screenX = Math.floor((sw / 2) * (1 + transformX / transformY));
      const scale   = sprite.scale ?? 1;

      const spriteH = Math.abs(Math.floor(sh / transformY)) * scale;
      const spriteW = spriteH;

      const drawStartY = Math.max(0,      Math.floor(-spriteH / 2 + sh / 2));
      const drawEndY   = Math.min(sh - 1, Math.floor( spriteH / 2 + sh / 2));
      const drawStartX = Math.max(0,      Math.floor(-spriteW / 2 + screenX));
      const drawEndX   = Math.min(sw - 1, Math.floor( spriteW / 2 + screenX));

      const tex = this.textures.get(sprite.textureKey);
      if (!tex) continue;

      for (let sx = drawStartX; sx <= drawEndX; sx++) {
        // Z-buffer check
        if (transformY >= zBuffer[sx]!) continue;

        const texX = Math.floor(((sx - (-spriteW / 2 + screenX)) * this.texSize) / spriteW);
        const clampedTexX = Math.max(0, Math.min(this.texSize - 1, texX));

        for (let sy = drawStartY; sy <= drawEndY; sy++) {
          const d    = sy * 256 - sh * 128 + spriteH * 128;
          const texY = Math.max(0, Math.min(this.texSize - 1, Math.floor(d * this.texSize / spriteH / 256)));
          const colour = tex[texY * this.texSize + clampedTexX]!;
          // Skip transparent pixels (alpha = 0)
          if ((colour >>> 24) === 0) continue;
          pixels[sy * sw + sx] = colour;
        }
      }
    }
  }

  /** Scales the internal render buffer to fill the canvas element. */
  resize(displayW: number, displayH: number): void {
    this.canvas.width  = displayW;
    this.canvas.height = displayH;
    // We draw at sw×sh then CSS scales via canvas CSS size
    // Actually we keep the canvas at sw×sh and rely on CSS scaling
  }

  hasTexture(key: string): boolean {
    return this.textures.has(key);
  }
}
