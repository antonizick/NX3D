import type { EnemyManifest } from '../types/index.ts';
import type { GameMap } from './Map.ts';
import type { Player } from './Player.ts';
import type { AudioManager } from './AudioManager.ts';
import { Projectile } from './Projectile.ts';

export type EnemyState = 'IDLE' | 'ALERT' | 'CHASING' | 'ATTACKING' | 'PAIN' | 'DEAD';

/** Degrees → 8-direction index (0 = front, 4 = back). */
function angleToSectorIndex(relAngleDeg: number): number {
  const normalized = ((relAngleDeg % 360) + 360) % 360;
  return Math.floor((normalized + 22.5) / 45) % 8;
}

export class Enemy {
  x: number;
  y: number;
  facing: number;        // degrees
  state: EnemyState = 'IDLE';
  hp: number;
  animFrame      = 0;
  animTimer      = 0;
  attackCooldown = 0;
  painTimer      = 0;
  alertTimer     = 0;

  // Sprite key resolved by renderer
  get spriteKey(): string {
    return this.resolveSprite();
  }

  constructor(
    x: number, y: number, facing: number,
    public manifest: EnemyManifest
  ) {
    this.x = x; this.y = y; this.facing = facing;
    this.hp = manifest.hp;
  }

  private resolveSprite(): string {
    const id = this.manifest.id;
    switch (this.state) {
      case 'DEAD':
        return `${id}/death_${Math.min(this.animFrame, this.manifest.sprites.death.frames - 1)}`;
      case 'PAIN':
        return `${id}/pain_0`;
      case 'ATTACKING':
        return `${id}/attack_${this.manifest.sprites.angles > 1 ? this.angleIndex : 0}_${this.animFrame}`;
      default:
        return `${id}/walk_${this.manifest.sprites.angles > 1 ? this.angleIndex : 0}_${this.animFrame}`;
    }
  }

  private _angleIndex = 0;
  get angleIndex(): number { return this._angleIndex; }

  updateAngleIndex(playerX: number, playerY: number): void {
    if (this.manifest.sprites.angles === 1) { this._angleIndex = 0; return; }
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const angleToPlayer = Math.atan2(dy, dx) * (180 / Math.PI);
    const relAngle = angleToPlayer - this.facing;
    this._angleIndex = angleToSectorIndex(relAngle);
  }

  update(dt: number, player: Player, map: GameMap, audio: AudioManager | null = null, enemyProjectiles?: Projectile[]): void {
    if (this.state === 'DEAD') {
      this.updateAnim(dt, this.manifest.sprites.death, false);
      return;
    }

    this.updateAngleIndex(player.x, player.y);

    const dx  = player.x - this.x;
    const dy  = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.state === 'PAIN') {
      this.painTimer -= dt;
      if (this.painTimer <= 0) {
        this.state = dist <= this.manifest.attackRange ? 'ATTACKING' : 'CHASING';
      }
      return;
    }

    // State transitions
    if (this.state === 'IDLE' || this.state === 'ALERT') {
      // Check line of sight (simplified: distance + no wall directly between)
      if (dist < this.manifest.sightRange && hasLOS(this.x, this.y, player.x, player.y, map)) {
        audio?.enemyAlert(this.manifest);
        this.state = 'CHASING';
      } else if (this.state === 'ALERT') {
        this.alertTimer -= dt;
        if (this.alertTimer <= 0) this.state = 'IDLE';
      }
    }

    if (this.state === 'CHASING') {
      if (dist <= this.manifest.attackRange) {
        this.state = 'ATTACKING';
        this.animFrame = 0;
      } else {
        // Move toward player
        const speed = this.manifest.speed * dt / 1000;
        const nx = this.x + (dx / dist) * speed;
        const ny = this.y + (dy / dist) * speed;
        if (!map.isWall(nx, this.y)) this.x = nx;
        if (!map.isWall(this.x, ny)) this.y = ny;
        this.facing = Math.atan2(dy, dx) * (180 / Math.PI);
        this.updateAnim(dt, this.manifest.sprites.walk, true);

        // Footstep — AudioManager prevents stacking; sound duration sets cadence
        const factor = Math.max(0, 1 - dist / 8);
        audio?.enemyStep(this.manifest, factor);
      }
    }

    if (this.state === 'ATTACKING') {
      this.attackCooldown -= dt;
      if (dist > this.manifest.attackRange * 1.5) {
        this.state = 'CHASING';
        return;
      }
      if (this.attackCooldown <= 0 && hasLOS(this.x, this.y, player.x, player.y, map)) {
        player.takeDamage(this.manifest.attackDamage);
        audio?.enemyAttack(this.manifest);
        this.attackCooldown = this.manifest.attackCooldown;
        // Visual tracer toward player — damage=0, already dealt above
        if (enemyProjectiles) {
          const edx = player.x - this.x; const edy = player.y - this.y;
          const edist = Math.sqrt(edx * edx + edy * edy);
          if (edist > 0) {
            enemyProjectiles.push(new Projectile(
              this.x, this.y,
              edx / edist, edy / edist,
              200, 0, 0.3, 'enemy_projectile', edist
            ));
          }
        }
      }
      this.updateAnim(dt, this.manifest.sprites.attack, true);
    }
  }

  private updateAnim(dt: number, anim: { frames: number; fps: number }, loop: boolean): void {
    this.animTimer += dt;
    const frameDuration = 1000 / anim.fps;
    while (this.animTimer >= frameDuration) {
      this.animTimer -= frameDuration;
      this.animFrame++;
      if (this.animFrame >= anim.frames) {
        if (loop) {
          this.animFrame = 0;
        } else {
          this.animFrame = anim.frames - 1;
        }
      }
    }
  }

  hit(damage: number, audio: AudioManager | null = null): void {
    if (this.state === 'DEAD') return;
    this.hp -= damage;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'DEAD';
      this.animFrame = 0;
      this.animTimer = 0;
      audio?.enemyDeath(this.manifest);
    } else {
      this.state = 'PAIN';
      this.painTimer = 200;
      audio?.enemyPain(this.manifest);
    }
  }

  get isDead(): boolean { return this.state === 'DEAD'; }
  get isFullyDead(): boolean {
    return this.state === 'DEAD' && this.animFrame >= this.manifest.sprites.death.frames - 1;
  }
}

/** Simple LOS check — traces cells between two points. */
function hasLOS(ax: number, ay: number, bx: number, by: number, map: GameMap): boolean {
  const dx = bx - ax; const dy = by - ay;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 4;
  const sx = dx / steps; const sy = dy / steps;
  let x = ax; let y = ay;
  for (let i = 0; i < steps; i++) {
    x += sx; y += sy;
    if (map.isWall(x, y)) return false;
  }
  return true;
}
