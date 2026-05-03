import type { Player } from './Player.ts';
import type { Enemy } from './Enemy.ts';
import type { GameMap } from './Map.ts';
import type { AudioManager } from './AudioManager.ts';
import { Projectile } from './Projectile.ts';

const TEX_SIZE = 64;

export type WeaponAnimState = 'IDLE' | 'FIRING' | 'EMPTY';

export class WeaponController {
  state:        WeaponAnimState = 'IDLE';
  frame         = 0;
  animTimer     = 0;
  bobTimer      = 0;
  bobY          = 0;
  bobX          = 0;
  reticleAlpha  = 0;
  readonly projectiles: Projectile[] = [];

  update(
    dt: number,
    player: Player,
    enemies: Enemy[],
    map: GameMap,
    firing: boolean,
    audio: AudioManager | null = null,
    weaponRange: number = 0   // 0 = unlimited
  ): void {
    const weapon = player.currentWeapon;
    const range  = weaponRange > 0 ? weaponRange : Infinity;

    // Weapon bob
    this.bobTimer += dt * 0.003;
    this.bobY = Math.abs(Math.sin(this.bobTimer)) * 8;
    this.bobX = Math.sin(this.bobTimer * 0.5)     * 4;

    // Reticle fade
    if (this.reticleAlpha > 0) this.reticleAlpha = Math.max(0, this.reticleAlpha - dt / 250);

    // Fire
    if (firing && this.state === 'IDLE') {
      if (player.canFire()) {
        player.consumeAmmo();
        this.state = 'FIRING';
        this.frame = 0;
        this.animTimer = 0;
        this.reticleAlpha = 1.0;
        audio?.weaponFire(weapon);

        if (weapon.behaviorType === 'hitscan') {
          this.resolveHitscan(player, enemies, weapon.damage, weapon.spread, range, audio);
        } else if (weapon.projectileSpeed) {
          const spread = (weapon.spread * Math.PI / 180) * (Math.random() - 0.5) * 2;
          const angle  = player.angle + spread;
          this.projectiles.push(new Projectile(
            player.x, player.y,
            Math.cos(angle), Math.sin(angle),
            weapon.projectileSpeed,
            weapon.damage,
            0.3,
            'player_projectile',
            range === Infinity ? undefined : range
          ));
        }
      } else {
        this.state = 'EMPTY';
        this.animTimer = 0;
        audio?.weaponEmpty(weapon);
      }
    }

    // Animation
    if (this.state === 'FIRING') {
      this.animTimer += dt;
      const fps = weapon.fps;
      if (this.animTimer >= 1000 / fps) {
        this.animTimer = 0;
        this.frame++;
        if (this.frame >= weapon.frames) {
          this.frame = 0;
          this.state = 'IDLE';
        }
      }
    } else if (this.state === 'EMPTY') {
      this.animTimer += dt;
      if (this.animTimer > 300) {
        this.state = 'IDLE';
        this.animTimer = 0;
      }
    }

    // Update projectiles
    for (const p of this.projectiles) {
      p.update(dt, map, enemies, player, true);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i]!.alive) this.projectiles.splice(i, 1);
    }
  }

  private resolveHitscan(
    player: Player,
    enemies: Enemy[],
    damage: number,
    spreadDeg: number,
    range: number,
    audio: AudioManager | null
  ): void {
    const spread = (spreadDeg * Math.PI / 180) * (Math.random() - 0.5) * 2;
    const angle  = player.angle + spread;
    const rayDX  = Math.cos(angle);
    const rayDY  = Math.sin(angle);

    let bestDist = Infinity; let bestEnemy: Enemy | null = null;
    for (const e of enemies) {
      if (e.isDead) continue;
      const ex = e.x - player.x;
      const ey = e.y - player.y;
      const t = ex * rayDX + ey * rayDY;
      if (t <= 0 || t > range) continue;
      const perpDist = Math.abs(ex * rayDY - ey * rayDX);
      if (perpDist < 0.5 && t < bestDist) {
        bestDist  = t;
        bestEnemy = e;
      }
    }
    if (bestEnemy) {
      bestEnemy.hit(damage, audio);
    }

    // Fast visual tracer — damage=0 so no double hit
    const tracerDist = isFinite(bestDist) ? bestDist : (isFinite(range) ? range : 30);
    this.projectiles.push(new Projectile(
      player.x, player.y,
      rayDX, rayDY,
      200,
      0,   // no damage — already resolved above
      0.3,
      'player_projectile',
      tracerDist
    ));
  }

  get weaponFrame(): number { return this.frame; }
}
