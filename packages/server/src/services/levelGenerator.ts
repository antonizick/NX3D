/**
 * Wolf3D-style BSP level generator.
 *
 * Algorithm:
 *  1. Fill 64x64 grid with walls (1 = stone).
 *  2. BSP-split the space into leaf nodes; carve a room in each leaf.
 *  3. Connect every pair of adjacent rooms with an L-shaped corridor.
 *  4. Run BFS to verify full connectivity; add extra corridors if needed.
 *  5. Add doors at corridor-room transitions.
 *  6. Place player start (room 0) and elevator (farthest room by BFS distance).
 *  7. Place enemies, items, keys, and secret walls per difficulty rules.
 *  8. Boss rules: 100% final level, 20% level 1, 33% elsewhere.
 */
import type {
  LevelData, EntityPlacement, DoorData, SecretWall,
  GeneratorConfig,
} from '../types/index.js';

const W = 64;
const H = 64;
const WALL = 1;
const FLOOR = 0;

// ─── PRNG (seeded, reproducible) ─────────────────────────────────────────────

class Rand {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    this.s = (Math.imul(1664525, this.s) + 1013904223) >>> 0;
    return this.s / 0x100000000;
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  bool(p = 0.5): boolean { return this.next() < p; }
  pick<T>(arr: T[]): T { return arr[this.int(0, arr.length - 1)]!; }
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
}

// ─── BSP Node ─────────────────────────────────────────────────────────────────

interface BSPNode {
  x: number; y: number; w: number; h: number;
  left?: BSPNode; right?: BSPNode;
  room?: Room;
}

interface Room { x: number; y: number; w: number; h: number; cx: number; cy: number; }

function bspSplit(node: BSPNode, depth: number, rng: Rand): void {
  const MIN_LEAF = 14;
  if (depth === 0 || (node.w < MIN_LEAF * 2 && node.h < MIN_LEAF * 2)) {
    carveRoom(node, rng);
    return;
  }
  const splitHoriz = node.w < MIN_LEAF * 2
    ? true
    : node.h < MIN_LEAF * 2
    ? false
    : rng.bool();

  if (splitHoriz) {
    const split = node.y + rng.int(MIN_LEAF, node.h - MIN_LEAF);
    node.left  = { x: node.x, y: node.y, w: node.w, h: split - node.y };
    node.right = { x: node.x, y: split,  w: node.w, h: node.y + node.h - split };
  } else {
    const split = node.x + rng.int(MIN_LEAF, node.w - MIN_LEAF);
    node.left  = { x: node.x,  y: node.y, w: split - node.x,            h: node.h };
    node.right = { x: split,   y: node.y, w: node.x + node.w - split,   h: node.h };
  }
  bspSplit(node.left,  depth - 1, rng);
  bspSplit(node.right, depth - 1, rng);
}

function carveRoom(node: BSPNode, rng: Rand): void {
  const MIN_ROOM = 5; const MAX_ROOM = 11;
  const rw = rng.int(MIN_ROOM, Math.min(MAX_ROOM, node.w - 4));
  const rh = rng.int(MIN_ROOM, Math.min(MAX_ROOM, node.h - 4));
  const rx = node.x + rng.int(2, node.w - rw - 2);
  const ry = node.y + rng.int(2, node.h - rh - 2);
  node.room = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
}

function collectRooms(node: BSPNode): Room[] {
  if (node.room) return [node.room];
  const rooms: Room[] = [];
  if (node.left)  rooms.push(...collectRooms(node.left));
  if (node.right) rooms.push(...collectRooms(node.right));
  return rooms;
}

// ─── Grid Carving ─────────────────────────────────────────────────────────────

function carveAll(grid: number[][], rooms: Room[]): void {
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        grid[y]![x] = FLOOR;
      }
    }
  }
}

function carveCorridor(grid: number[][], ax: number, ay: number, bx: number, by: number): void {
  // L-shaped corridor: horizontal first, then vertical
  const x0 = Math.min(ax, bx); const x1 = Math.max(ax, bx);
  const y0 = Math.min(ay, by); const y1 = Math.max(ay, by);
  for (let x = x0; x <= x1; x++) grid[ay]![x] = FLOOR;
  for (let y = y0; y <= y1; y++) grid[y]![bx]  = FLOOR;
}

// ─── BFS Connectivity ─────────────────────────────────────────────────────────

function bfsReachable(grid: number[][], sx: number, sy: number): Set<string> {
  const queue: [number, number][] = [[sx, sy]];
  const visited = new Set<string>([`${sx},${sy}`]);
  while (queue.length) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
      const nx = cx + dx; const ny = cy + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const key = `${nx},${ny}`;
      if (!visited.has(key) && grid[ny]![nx] === FLOOR) {
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return visited;
}

function ensureConnectivity(grid: number[][], rooms: Room[]): void {
  if (rooms.length === 0) return;
  let reachable = bfsReachable(grid, rooms[0]!.cx, rooms[0]!.cy);
  let retries = 0;
  while (reachable.size < rooms.filter(r => grid[r.cy]![r.cx] === FLOOR).length && retries++ < 100) {
    // Find an unreachable room and connect it to the nearest reachable room
    const unreachable = rooms.filter(r => !reachable.has(`${r.cx},${r.cy}`));
    if (unreachable.length === 0) break;
    const target = unreachable[0]!;
    // Find closest reachable room
    let best: Room | null = null; let bestDist = Infinity;
    for (const r of rooms) {
      if (!reachable.has(`${r.cx},${r.cy}`)) continue;
      const d = Math.abs(r.cx - target.cx) + Math.abs(r.cy - target.cy);
      if (d < bestDist) { bestDist = d; best = r; }
    }
    if (best) carveCorridor(grid, best.cx, best.cy, target.cx, target.cy);
    reachable = bfsReachable(grid, rooms[0]!.cx, rooms[0]!.cy);
  }
}

// ─── BFS Distance Map ─────────────────────────────────────────────────────────

function bfsDistances(grid: number[][], sx: number, sy: number): Map<string, number> {
  const dist = new Map<string, number>([[`${sx},${sy}`, 0]]);
  const queue: [number, number][] = [[sx, sy]];
  while (queue.length) {
    const [cx, cy] = queue.shift()!;
    const cd = dist.get(`${cx},${cy}`)!;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
      const nx = cx + dx; const ny = cy + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const key = `${nx},${ny}`;
      if (!dist.has(key) && grid[ny]![nx] === FLOOR) {
        dist.set(key, cd + 1);
        queue.push([nx, ny]);
      }
    }
  }
  return dist;
}

// ─── Door Placement ───────────────────────────────────────────────────────────

function placeDoors(grid: number[][], rooms: Room[], rng: Rand): DoorData[] {
  const doors: DoorData[] = [];
  // Find corridor cells adjacent to room borders
  for (const room of rooms) {
    // Check cells just outside each room edge for corridor candidates
    const candidates: [number, number, 'horizontal' | 'vertical'][] = [
      [room.cx, room.y - 1, 'horizontal'],  // top
      [room.cx, room.y + room.h, 'horizontal'],  // bottom
      [room.x - 1, room.cy, 'vertical'],   // left
      [room.x + room.w, room.cy, 'vertical'], // right
    ];
    for (const [cx, cy, orient] of candidates) {
      if (cx < 1 || cx >= W-1 || cy < 1 || cy >= H-1) continue;
      if (grid[cy]![cx] !== FLOOR) continue;
      // Only add door if not already a room floor
      const inRoom = rooms.some(r =>
        cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h
      );
      if (!inRoom && rng.bool(0.6)) {
        // Avoid duplicate doors
        if (!doors.some(d => d.x === cx && d.y === cy)) {
          doors.push({ x: cx, y: cy, orientation: orient, locked: false });
        }
      }
    }
  }
  return doors;
}

// ─── Secret Walls ─────────────────────────────────────────────────────────────

function placeSecrets(grid: number[][], rooms: Room[], rng: Rand, count: number): SecretWall[] {
  const secrets: SecretWall[] = [];
  const dirs: [number, number, SecretWall['direction']][] = [[0,-1,'north'],[0,1,'south'],[1,0,'east'],[-1,0,'west']];
  const shuffledRooms = rng.shuffle([...rooms]);

  for (const room of shuffledRooms) {
    if (secrets.length >= count) break;
    // Look for a dead-end wall adjacent to the room
    for (const [dx, dy, dir] of dirs) {
      const wx = room.x - dx;
      const wy = room.y - dy;
      if (wx < 1 || wx >= W-1 || wy < 1 || wy >= H-1) continue;
      if (grid[wy]![wx] !== WALL) continue;
      // Wall must have floor on its other side
      const behindX = wx - dx;
      const behindY = wy - dy;
      if (behindX < 1 || behindX >= W-1 || behindY < 1 || behindY >= H-1) continue;
      if (grid[behindY]![behindX] !== FLOOR) continue;
      secrets.push({ wallX: wx, wallY: wy, direction: dir, textureId: 1 });
      break;
    }
  }
  return secrets;
}

// ─── Entity Placement ─────────────────────────────────────────────────────────

interface DifficultyParams {
  enemiesPerRoom: [number, number]; // [min, max] count
  healthChance:   number;           // chance any health spawns in a room
  healthMax:      number;           // max health items per room
  ammoMin:        number;           // guaranteed ammo packs per room
  ammoMax:        number;           // max ammo packs per room
  treasureChance: number;
  treasureMax:    number;
}

function diffParams(difficulty: GeneratorConfig['difficulty'], levelProgress: number): DifficultyParams {
  const lp = levelProgress; // 0 (level 1) → 1 (final level)
  switch (difficulty) {
    case 'easy': return {
      enemiesPerRoom: [1, 1 + Math.floor(lp * 2)],
      healthChance: 0.80, healthMax: 3,
      ammoMin: 1,         ammoMax: 4,
      treasureChance: 0.60, treasureMax: 3,
    };
    case 'hard': return {
      enemiesPerRoom: [2 + Math.floor(lp * 2), 3 + Math.floor(lp * 3)],
      healthChance: 0.25, healthMax: 1,
      ammoMin: 1,         ammoMax: 2,
      treasureChance: 0.50, treasureMax: 2,
    };
    default: return {
      enemiesPerRoom: [1 + Math.floor(lp), 2 + Math.floor(lp * 2)],
      healthChance: 0.50, healthMax: 2,
      ammoMin: 1,         ammoMax: 3,
      treasureChance: 0.55, treasureMax: 3,
    };
  }
}

/** Shuffled list of all valid interior tile centres for a room. */
function roomPositions(room: Room, rng: Rand): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let dy = 1; dy < room.h - 1; dy++) {
    for (let dx = 1; dx < room.w - 1; dx++) {
      pts.push({ x: room.x + dx + 0.5, y: room.y + dy + 0.5 });
    }
  }
  return rng.shuffle(pts);
}

function placeEntities(
  rooms: Room[],
  startRoom: Room,
  endRoom: Room,
  distMap: Map<string, number>,
  cfg: GeneratorConfig,
  rng: Rand
): EntityPlacement[] {
  const entities: EntityPlacement[] = [];
  const levelProgress = (cfg.levelId - 1) / Math.max(1, cfg.levelsPerEpisode - 1);
  const params = diffParams(cfg.difficulty, levelProgress);

  const regularEnemies = cfg.enemies.filter(e => !e.isBoss);
  const bossEnemies    = cfg.enemies.filter(e => e.isBoss);

  const healthItems   = cfg.items.filter(i => i.type === 'health');
  const smallHealth   = healthItems.filter(i => i.value <= 15);  // food / small heals
  const bigHealth     = healthItems.filter(i => i.value > 15);   // medkits
  const ammoItems     = cfg.items.filter(i => i.type === 'ammo');
  const treasureItems = cfg.items.filter(i => i.type === 'treasure').sort((a, b) => a.score - b.score);
  const lifeItems     = cfg.items.filter(i => i.type === 'life');
  const weaponItems   = cfg.items.filter(i => i.type === 'weapon');

  const isFinal = cfg.isFinalLevel;
  const level   = cfg.levelId;
  const maxDist = distMap.size > 0 ? Math.max(...distMap.values()) : 1;

  // ── Boss ──────────────────────────────────────────────────────────────────
  let bossPlaced = false;
  if (bossEnemies.length > 0) {
    const bossProb = isFinal ? 1.0 : level === 1 ? 0.2 : 0.333;
    if (rng.bool(bossProb)) {
      entities.push({
        type: 'enemy',
        id: rng.pick(bossEnemies).id,
        x: endRoom.cx + 0.5,
        y: endRoom.cy + 0.5,
        facing: rng.int(0, 7) * 45,
      });
      bossPlaced = true;
    }
  }
  void bossPlaced; // referenced indirectly via boss placement above

  // ── Start room: opening supplies, no enemies ───────────────────────────────
  {
    const pts = roomPositions(startRoom, rng);
    let pi = 0;
    const take = () => pts[pi++ % pts.length] ?? { x: startRoom.cx + 0.5, y: startRoom.cy + 0.5 };

    if (ammoItems.length > 0) {
      const p = take();
      entities.push({ type: 'item', id: rng.pick(ammoItems).id, x: p.x, y: p.y });
    }
    if (cfg.difficulty === 'easy' && ammoItems.length > 0) {
      const p = take();
      entities.push({ type: 'item', id: rng.pick(ammoItems).id, x: p.x, y: p.y });
    }
    if (cfg.difficulty === 'hard' && smallHealth.length > 0) {
      const p = take();
      entities.push({ type: 'item', id: rng.pick(smallHealth).id, x: p.x, y: p.y });
    }
  }

  // Max one weapon pickup per level
  let weaponPlaced = false;

  // ── Per-room population ────────────────────────────────────────────────────
  for (const room of rooms) {
    if (room === startRoom) continue;

    const roomDist = distMap.get(`${room.cx},${room.cy}`) ?? 0;
    const relDist  = maxDist > 0 ? roomDist / maxDist : 0;

    // Shared shuffled position pool — enemies and items consume from the same
    // pool so they never land on the same tile.
    const pts = roomPositions(room, rng);
    let pi = 0;
    const take = (): { x: number; y: number } =>
      pts[pi++ % pts.length] ?? { x: room.cx + 0.5, y: room.cy + 0.5 };

    // ── Enemies ────────────────────────────────────────────────────────────
    if (regularEnemies.length > 0) {
      const [lo, hi] = params.enemiesPerRoom;
      const count    = rng.int(lo, hi);
      // Bias toward tougher enemies deeper in the level
      const tierCut  = Math.max(1, Math.floor(regularEnemies.length * (0.3 + relDist * 0.7)));
      const pool     = regularEnemies.slice(regularEnemies.length - tierCut);
      for (let i = 0; i < count; i++) {
        const p = take();
        entities.push({ type: 'enemy', id: rng.pick(pool).id, x: p.x, y: p.y, facing: rng.int(0, 7) * 45 });
      }
    }

    // ── Health ────────────────────────────────────────────────────────────
    if (healthItems.length > 0 && rng.bool(params.healthChance)) {
      const count = rng.int(1, params.healthMax);
      for (let i = 0; i < count; i++) {
        // Early rooms lean toward small heals; later rooms mix in medkits
        const pool = (relDist < 0.4 && smallHealth.length > 0)
          ? (rng.bool(0.7) ? smallHealth : healthItems)
          : (bigHealth.length > 0 && rng.bool(0.4) ? bigHealth : healthItems);
        const p = take();
        entities.push({ type: 'item', id: rng.pick(pool).id, x: p.x, y: p.y });
      }
    }

    // ── Ammo (guaranteed 1+ per room so the player is never starved) ───────
    if (ammoItems.length > 0) {
      const count = rng.int(params.ammoMin, params.ammoMax);
      for (let i = 0; i < count; i++) {
        const p = take();
        entities.push({ type: 'item', id: rng.pick(ammoItems).id, x: p.x, y: p.y });
      }
    }

    // ── Treasure (scattered around rooms, rewards exploration) ─────────────
    if (treasureItems.length > 0 && rng.bool(params.treasureChance)) {
      const count = rng.int(1, params.treasureMax);
      for (let i = 0; i < count; i++) {
        // Higher-value treasures appear deeper in the level
        const tierIdx = Math.floor(relDist * treasureItems.length);
        const pool    = treasureItems.slice(0, Math.max(1, tierIdx + 1));
        const p       = take();
        entities.push({ type: 'item', id: rng.pick(pool).id, x: p.x, y: p.y });
      }
    }

    // ── Weapon pickup (rare, levels 2+, one per level, mid-to-far rooms) ───
    if (!weaponPlaced && weaponItems.length > 0 && level >= 2 && relDist > 0.25) {
      const chance = 0.08 + levelProgress * 0.12; // 8% on level 2 → ~20% on final level
      if (rng.bool(chance)) {
        const p = take();
        entities.push({ type: 'item', id: rng.pick(weaponItems).id, x: p.x, y: p.y });
        weaponPlaced = true;
      }
    }

    // ── Extra life (very rare, not on the final level) ─────────────────────
    if (lifeItems.length > 0 && !isFinal) {
      const chance = cfg.difficulty === 'hard' ? 0.04 : 0.015;
      if (rng.bool(chance)) {
        const p = take();
        entities.push({ type: 'item', id: rng.pick(lifeItems).id, x: p.x, y: p.y });
      }
    }
  }

  return entities;
}

// ─── Main Generator ───────────────────────────────────────────────────────────

export function generateLevel(cfg: GeneratorConfig): LevelData {
  const seed = cfg.seed ?? (cfg.levelId * 3141592 + cfg.episode * 271828);
  const rng  = new Rand(seed);

  // Init grid
  const grid: number[][] = Array.from({ length: H }, () => new Array<number>(W).fill(WALL));

  // BSP split (depth 4 → ~16 leaves)
  const root: BSPNode = { x: 1, y: 1, w: W - 2, h: H - 2 };
  bspSplit(root, 4, rng);
  const rooms = collectRooms(root);

  // Carve rooms
  carveAll(grid, rooms);

  // Connect rooms with corridors (nearest-neighbour pairs)
  const shuffled = rng.shuffle(rooms);
  for (let i = 0; i < shuffled.length - 1; i++) {
    carveCorridor(grid, shuffled[i]!.cx, shuffled[i]!.cy, shuffled[i + 1]!.cx, shuffled[i + 1]!.cy);
  }

  // Guarantee full connectivity
  ensureConnectivity(grid, rooms);

  // BFS from room 0 to find farthest room (for elevator)
  const startRoom = rooms[0]!;
  const distMap   = bfsDistances(grid, startRoom.cx, startRoom.cy);
  let endRoom     = startRoom;
  let maxDist     = 0;
  for (const room of rooms) {
    const d = distMap.get(`${room.cx},${room.cy}`) ?? 0;
    if (d > maxDist) { maxDist = d; endRoom = room; }
  }

  // Doors
  const doors = placeDoors(grid, rooms, rng);

  // Secrets (1-3 per level)
  const secretCount = rng.int(1, 3);
  const secrets     = placeSecrets(grid, rooms, rng, secretCount);

  // Entities
  const entities = placeEntities(rooms, startRoom, endRoom, distMap, cfg, rng);

  // Exit sprite — placed exactly at elevator position, always exactly one per level
  const exitItem = cfg.items.find(i => i.type === 'exit');
  if (exitItem) {
    entities.push({ type: 'item', id: exitItem.id, x: endRoom.cx + 0.5, y: endRoom.cy + 0.5 });
  }

  // Apply accent wall textures — tile 1 stays dominant (~78%); tiles 2-6 zone by room
  const accentIds = cfg.textures
    .filter(t => t.type === 'wall')
    .map(t => parseInt(t.id, 10))
    .filter(id => id !== WALL);
  if (accentIds.length > 0) {
    // Each room gets a cycling accent so every tile in 2-6 gets floor coverage
    const shuffledAccents = rng.shuffle([...accentIds]);
    const roomAccent = new Map<Room, number>(
      rooms.map((r, i) => [r, shuffledAccents[i % shuffledAccents.length]!])
    );
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y]![x] !== WALL || !rng.bool(0.22)) continue;
        // Use the accent of the nearest room so zones look natural
        let best = rooms[0]!;
        let bestD = Infinity;
        for (const r of rooms) {
          const d = Math.abs(r.cx - x) + Math.abs(r.cy - y);
          if (d < bestD) { bestD = d; best = r; }
        }
        grid[y]![x] = roomAccent.get(best)!;
      }
    }
  }

  const hasBoss = entities.some(e => {
    const enemy = cfg.enemies.find(en => en.id === e.id);
    return enemy?.isBoss ?? false;
  });

  const levelNum  = (cfg.episode - 1) * cfg.levelsPerEpisode + cfg.levelId;
  const parTime   = 60 + levelNum * 15;

  return {
    levelId:    cfg.levelId,
    name:       `Level ${cfg.levelId}`,
    episode:    cfg.episode,
    grid,
    doors,
    entities,
    secrets,
    elevator:   { x: endRoom.cx, y: endRoom.cy },
    playerStart:{ x: startRoom.cx + 0.5, y: startRoom.cy + 0.5, angle: 0 },
    parTime,
    isFinalLevel: cfg.isFinalLevel,
    hasBoss,
  };
}
