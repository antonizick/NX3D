/**
 * Classic Wolf3D DDA raycaster.
 *
 * Produces:
 *  • wallStrips[]  — per-column: texture index, texX, perpWallDist, side (0=EW/1=NS)
 *  • zBuffer[]     — perpendicular distances for sprite occlusion
 */
import type { GameMap } from './Map.ts';
import type { Player } from './Player.ts';

export interface WallStrip {
  texIndex:     number;   // wall texture id (>0) or 0 for door
  texX:         number;   // horizontal position within texture [0, TEX_SIZE)
  perpWallDist: number;   // perpendicular distance to camera plane
  side:         0 | 1;   // 0 = vertical wall (EW), 1 = horizontal wall (NS)
  drawStart:    number;
  drawEnd:      number;
  lineHeight:   number;
}

export class Raycaster {
  readonly zBuffer: Float64Array;

  constructor(private sw: number, private sh: number, private texSize: number = 64) {
    this.zBuffer = new Float64Array(sw).fill(Infinity);
  }

  castAll(player: Player, map: GameMap): WallStrip[] {
    const strips: WallStrip[] = new Array(this.sw);

    for (let x = 0; x < this.sw; x++) {
      // Camera-space x: −1 (left) to +1 (right)
      const cameraX = (2 * x) / this.sw - 1;

      // Ray direction
      const rayDirX = player.dirX + player.planeX * cameraX;
      const rayDirY = player.dirY + player.planeY * cameraX;

      let mapX = Math.floor(player.x);
      let mapY = Math.floor(player.y);

      // Avoid division by zero with very small epsilon
      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

      let stepX: number, stepY: number;
      let sideDistX: number, sideDistY: number;

      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (player.x - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1 - player.x) * deltaDistX;
      }
      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (player.y - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1 - player.y) * deltaDistY;
      }

      // DDA
      let side: 0 | 1 = 0;
      let hit = false;
      let iterations = 0;

      while (!hit && iterations++ < 128) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        const cell = map.cellAt(mapX, mapY);
        if (cell > 0) {
          // Check if it's a fully-open door
          const door = map.getDoor(mapX, mapY);
          if (door && door.offset > 0.99) continue;
          hit = true;
        }
      }

      const perpWallDist = side === 0
        ? sideDistX - deltaDistX
        : sideDistY - deltaDistY;

      // Wall texture X
      let wallX: number; // [0,1) within wall tile
      if (side === 0) {
        wallX = player.y + perpWallDist * rayDirY;
      } else {
        wallX = player.x + perpWallDist * rayDirX;
      }
      wallX -= Math.floor(wallX);

      // Correct texX direction so texture doesn't mirror
      let texX = Math.floor(wallX * this.texSize);
      if (side === 0 && rayDirX > 0) texX = (this.texSize - 1) - texX;
      if (side === 1 && rayDirY < 0) texX = (this.texSize - 1) - texX;

      const lineHeight = Math.floor(this.sh / Math.max(perpWallDist, 0.001));
      const drawStart  = Math.max(0,         Math.floor((this.sh - lineHeight) / 2));
      const drawEnd    = Math.min(this.sh - 1, Math.floor((this.sh + lineHeight) / 2));

      const texIndex = map.cellAt(mapX, mapY);

      strips[x] = { texIndex, texX, perpWallDist, side, drawStart, drawEnd, lineHeight };
      this.zBuffer[x] = perpWallDist;
    }

    return strips;
  }
}
