import type { LevelData, DoorData } from '../types/index.ts';

export const TILE_FLOOR    = 0;
export const TILE_ELEVATOR = -2;

export interface Door {
  data:    DoorData;
  state:   'closed' | 'opening' | 'open' | 'closing';
  offset:  number;   // 0 = closed, 1 = fully open
  timer:   number;   // time since state change (ms)
}

const DOOR_SPEED    = 1.0;   // open/close per second
const DOOR_HOLD_MS  = 3000;  // how long open before closing

export class GameMap {
  readonly width  = 64;
  readonly height = 64;
  readonly grid: number[][];
  readonly doors: Door[];
  readonly elevatorX: number;
  readonly elevatorY: number;
  private  doorGrid: Map<string, Door> = new Map();

  constructor(private level: LevelData) {
    this.grid = level.grid.map(row => [...row]);
    this.elevatorX = level.elevator.x;
    this.elevatorY = level.elevator.y;

    this.doors = level.doors.map(d => ({
      data: d, state: 'closed', offset: 0, timer: 0,
    }));
    for (const door of this.doors) {
      this.doorGrid.set(`${door.data.x},${door.data.y}`, door);
    }
  }

  isWall(x: number, y: number): boolean {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) return true;
    const cell = this.grid[gy]![gx] ?? 0;
    if (cell > 0) {
      const door = this.doorGrid.get(`${gx},${gy}`);
      if (door && door.offset > 0.99) return false; // door fully open
      if (door) return true; // door is a blocking wall unless open
      return true;
    }
    return false;
  }

  cellAt(gx: number, gy: number): number {
    if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) return 1;
    return this.grid[gy]![gx] ?? 0;
  }

  getDoor(gx: number, gy: number): Door | undefined {
    return this.doorGrid.get(`${gx},${gy}`);
  }

  tryOpenDoor(gx: number, gy: number, hasGold: boolean, hasSilver: boolean): boolean {
    const door = this.doorGrid.get(`${gx},${gy}`);
    if (!door) return false;
    if (door.state === 'open' || door.state === 'opening') return true;
    if (door.data.locked) {
      if (door.data.keyColor === 'gold'   && !hasGold)   return false;
      if (door.data.keyColor === 'silver' && !hasSilver) return false;
    }
    door.state = 'opening';
    door.timer = 0;
    return true;
  }

  update(dt: number): void {
    for (const door of this.doors) {
      const dtSec = dt / 1000;
      switch (door.state) {
        case 'opening':
          door.offset = Math.min(1, door.offset + DOOR_SPEED * dtSec);
          if (door.offset >= 1) { door.state = 'open'; door.timer = 0; }
          break;
        case 'open':
          door.timer += dt;
          if (door.timer > DOOR_HOLD_MS) { door.state = 'closing'; }
          break;
        case 'closing':
          door.offset = Math.max(0, door.offset - DOOR_SPEED * dtSec);
          if (door.offset <= 0) { door.state = 'closed'; door.timer = 0; }
          break;
      }
    }
  }

  isAtElevator(x: number, y: number): boolean {
    return Math.floor(x) === Math.floor(this.elevatorX) &&
           Math.floor(y) === Math.floor(this.elevatorY);
  }
}
