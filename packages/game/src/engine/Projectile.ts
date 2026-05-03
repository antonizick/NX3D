import type { GameMap } from './Map.ts';
import type { Enemy } from './Enemy.ts';
import type { Player } from './Player.ts';

export class Projectile {
  x: number;
  y: number;
  alive = true;
  private distTraveled = 0;

  constructor(
    x: number, y: number,
    private dirX: number, private dirY: number,
    private speed: number,          // tiles/second
    private damage: number,
    private hitRadius: number = 0.3,
    public  textureKey: string = 'projectile',
    private maxDist?: number        // tiles; projectile dies after traveling this far
  ) {
    this.x = x; this.y = y;
  }

  update(dt: number, map: GameMap, enemies: Enemy[], player: Player, isPlayerShot: boolean): void {
    if (!this.alive) return;
    const dist = this.speed * dt / 1000;

    this.distTraveled += dist;
    if (this.maxDist !== undefined && this.distTraveled >= this.maxDist) {
      this.alive = false;
      return;
    }

    const nx = this.x + this.dirX * dist;
    const ny = this.y + this.dirY * dist;

    if (map.isWall(nx, ny)) {
      this.alive = false;
      return;
    }

    this.x = nx;
    this.y = ny;

    if (isPlayerShot) {
      for (const enemy of enemies) {
        if (enemy.isDead) continue;
        const dx = enemy.x - this.x; const dy = enemy.y - this.y;
        if (Math.sqrt(dx * dx + dy * dy) < this.hitRadius) {
          if (this.damage > 0) enemy.hit(this.damage);
          this.alive = false;
          return;
        }
      }
    } else {
      const dx = player.x - this.x; const dy = player.y - this.y;
      if (Math.sqrt(dx * dx + dy * dy) < this.hitRadius) {
        if (this.damage > 0) player.takeDamage(this.damage);
        this.alive = false;
      }
    }
  }
}
