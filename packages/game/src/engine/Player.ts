import type { GameMap } from './Map.ts';
import type { Input } from './Input.ts';
import type { TenantConfig, WeaponManifest } from '../types/index.ts';

const TWO_PI    = Math.PI * 2;
const MOVE_SPEED  = 3.0;    // tiles/second
const ROT_SPEED   = 2.5;    // radians/second (keyboard)
const MOUSE_SENSE = 0.002;  // radians/pixel
const COLLISION_R = 0.25;   // player radius in tiles

export class Player {
  x: number;
  y: number;
  angle: number;   // radians

  // Camera plane (perpendicular to dir, length = tan(FOV/2))
  // FOV = 66°, plane length ≈ 0.66
  readonly fov = 66 * (Math.PI / 180);
  get dirX(): number { return Math.cos(this.angle); }
  get dirY(): number { return Math.sin(this.angle); }
  get planeX(): number { return -Math.sin(this.angle) * 0.66; }
  get planeY(): number { return  Math.cos(this.angle) * 0.66; }

  // Stats
  health:  number;
  lives:   number;
  score:   number;
  ammo:    Record<string, number>;
  keys:    ('gold' | 'silver')[];
  weapons: string[];
  currentWeapon: WeaponManifest;
  secretsFound = 0;
  kills        = 0;
  treasures    = 0;
  difficulty:  'easy' | 'normal' | 'hard' = 'normal';

  // Pain flash
  painTimer    = 0;
  attackCooldown = 0;

  constructor(
    x: number, y: number, angleDeg: number,
    private cfg: TenantConfig
  ) {
    this.x = x; this.y = y;
    this.angle = angleDeg * (Math.PI / 180);
    this.health  = cfg.game.maxHealth;
    this.lives   = cfg.game.startingLives;
    this.score   = 0;
    this.keys    = [];
    this.weapons = [cfg.weapons[0]?.id ?? ''];
    this.currentWeapon = cfg.weapons[0]!;
    this.ammo    = Object.fromEntries(
      Object.entries(cfg.game.maxAmmo).map(([k, v]) => [k, Math.floor(v * 0.3)])
    );
  }

  /** Returns true if player died this frame. */
  update(dt: number, map: GameMap, input: Input): boolean {
    const dtSec = dt / 1000;

    // Rotation
    let rotDelta = 0;
    if (input.isDown('ArrowLeft'))  rotDelta -= ROT_SPEED * dtSec;
    if (input.isDown('ArrowRight')) rotDelta += ROT_SPEED * dtSec;
    rotDelta += input.consumeMouseDX() * MOUSE_SENSE;
    this.angle = (this.angle + rotDelta + TWO_PI) % TWO_PI;

    // Movement
    let moveX = 0; let moveY = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) {
      moveX += this.dirX; moveY += this.dirY;
    }
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) {
      moveX -= this.dirX; moveY -= this.dirY;
    }
    if (input.isDown('KeyA')) { moveX += this.dirY; moveY -= this.dirX; }
    if (input.isDown('KeyD')) { moveX -= this.dirY; moveY += this.dirX; }

    const len = Math.sqrt(moveX * moveX + moveY * moveY);
    if (len > 0) {
      const speed = MOVE_SPEED * dtSec;
      const nx = this.x + (moveX / len) * speed;
      const ny = this.y + (moveY / len) * speed;
      if (!map.isWall(nx, this.y)) this.x = nx;
      if (!map.isWall(this.x, ny)) this.y = ny;
    }

    // Pain timer
    if (this.painTimer > 0) this.painTimer -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    return false;
  }

  takeDamage(amount: number): boolean {
    const scale = this.difficulty === 'easy' ? 0.5 : this.difficulty === 'hard' ? 1.5 : 1.0;
    this.health -= Math.round(amount * scale);
    this.painTimer = 300;
    if (this.health <= 0) {
      this.health = 0;
      this.lives--;
      return true; // died
    }
    return false;
  }

  heal(amount: number): void {
    this.health = Math.min(this.cfg.game.maxHealth, this.health + amount);
  }

  addAmmo(type: string, amount: number): void {
    const max = this.cfg.game.maxAmmo[type] ?? 999;
    this.ammo[type] = Math.min(max, (this.ammo[type] ?? 0) + amount);
  }

  hasKey(color: 'gold' | 'silver'): boolean {
    return this.keys.includes(color);
  }

  pickupKey(color: 'gold' | 'silver'): void {
    if (!this.hasKey(color)) this.keys.push(color);
  }

  switchWeapon(idx: number): void {
    const id = this.weapons[idx];
    if (!id) return;
    const manifest = this.cfg.weapons.find(w => w.id === id);
    if (manifest) this.currentWeapon = manifest;
  }

  canFire(): boolean {
    const w = this.currentWeapon;
    if (this.attackCooldown > 0) return false;
    if (w.ammoType === 'none') return true;
    return (this.ammo[w.ammoType] ?? 0) >= w.ammoPerShot;
  }

  consumeAmmo(): void {
    const w = this.currentWeapon;
    if (w.ammoType !== 'none') {
      this.ammo[w.ammoType] = Math.max(0, (this.ammo[w.ammoType] ?? 0) - w.ammoPerShot);
    }
    this.attackCooldown = 1000 / w.fireRate;
  }

  /** Health face index: 0 = full, 5 = dead. */
  get faceIndex(): number {
    if (this.health <= 0)   return 5;
    if (this.health <= 20)  return 4;
    if (this.health <= 40)  return 3;
    if (this.health <= 60)  return 2;
    if (this.health <= 80)  return 1;
    return 0;
  }
}
