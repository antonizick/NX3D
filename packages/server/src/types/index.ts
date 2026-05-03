// ─── Tenant / Config ─────────────────────────────────────────────────────────

export interface TenantConfig {
  tenantId: string;
  name: string;
  logoUrl?: string;
  createdAt: string;
  narrative?: string;
  theme: {
    primaryColor: string;
    accentColor: string;
    hudColor: string;
    skyColor: string;
    floorColor: string;
  };
  game: {
    title: string;
    episodes: number;
    levelsPerEpisode: number;
    startingLives: number;
    maxHealth: number;
    maxAmmo: Record<string, number>;
    weaponRange?: number; // tiles; 0 or absent = unlimited
  };
  enemies: EnemyManifest[];
  weapons: WeaponManifest[];
  items: ItemManifest[];
  textures: TextureManifest[];
  audio: AudioManifest;
}

export interface EnemyManifest {
  id: string;
  name: string;
  hp: number;
  speed: number;           // tiles/second
  attackDamage: number;
  attackRange: number;     // tiles
  attackCooldown: number;  // ms
  sightRange: number;      // tiles (line-of-sight trigger)
  isBoss: boolean;
  score: number;
  dropItem: string | null; // itemId or null
  sprites: {
    angles: 1 | 8;
    walk:   { frames: number; fps: number };
    attack: { frames: number; fps: number };
    death:  { frames: number; fps: number };
    pain:   { frames: number; fps: number };
  };
  sounds: {
    alert:  string;
    pain:   string;
    death:  string;
    attack: string;
    step?:  string;
  };
}

export interface WeaponManifest {
  id: string;
  name: string;
  damage: number;
  fireRate: number;       // shots/second
  ammoType: string;
  ammoPerShot: number;
  behaviorType: 'hitscan' | 'projectile';
  projectileSpeed?: number; // tiles/second (projectile only)
  spread: number;         // degrees
  frames: number;
  fps: number;
  sounds: {
    fire: string;
    empty: string;
    reload?: string;
  };
}

export interface ItemManifest {
  id: string;
  name: string;
  type: 'health' | 'ammo' | 'key' | 'treasure' | 'life' | 'weapon' | 'exit';
  value: number;
  ammoType?: string;
  weaponId?: string;
  keyColor?: 'gold' | 'silver';
  score: number;
  sounds?: {
    pickup?: string;
  };
}

export interface TextureManifest {
  id: string;
  name: string;
  path: string;           // relative to tenant assets/textures/
  darkVariant?: string;   // optional N/S darker path
  type: 'wall' | 'floor' | 'ceiling' | 'door';
}

export interface AudioManifest {
  music?: string[];     // filenames in sounds/music/ — played in random order
  playerStep?: string;  // filename in sounds/player/
  playerDeath?: string; // filename in sounds/player/
}

// ─── Level ───────────────────────────────────────────────────────────────────

export interface LevelData {
  levelId: number;
  name: string;
  episode: number;
  /** 64×64 grid. 0 = open floor, -1 = void (unreachable), ≥1 = texture index */
  grid: number[][];
  doors: DoorData[];
  entities: EntityPlacement[];
  secrets: SecretWall[];
  elevator: { x: number; y: number };
  playerStart: { x: number; y: number; angle: number };
  parTime: number;        // seconds
  isFinalLevel: boolean;
  hasBoss: boolean;
  music?: string;
  floorTextureId?: string;
  ceilingTextureId?: string;
  onLoadMessage?: string;
  onExitMessage?: string;
}

export interface DoorData {
  x: number;
  y: number;
  orientation: 'horizontal' | 'vertical';
  locked: boolean;
  keyColor?: 'gold' | 'silver';
}

export interface EntityPlacement {
  type: 'enemy' | 'item';
  id: string;             // enemyId or itemId from manifest
  x: number;
  y: number;
  facing?: number;        // degrees 0–359 (enemies)
}

export interface SecretWall {
  wallX: number;
  wallY: number;
  direction: 'north' | 'south' | 'east' | 'west';
  textureId: number;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: 'builder' | 'player';
  totpSecret?: string;
  totpEnabled: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface UsersFile {
  users: UserRecord[];
}

// ─── Save ────────────────────────────────────────────────────────────────────

export interface SaveData {
  playerId: string;
  tenantId: string;
  savedAt: string;
  currentLevel: number;
  currentEpisode: number;
  score: number;
  lives: number;
  health: number;
  weapons: string[];
  currentWeapon: string;
  ammo: Record<string, number>;
  keys: ('gold' | 'silver')[];
  completedLevels: number[];
  difficulty: 'easy' | 'normal' | 'hard';
  secretsFound: number;
  kills: number;
  treasures: number;
}

// ─── JWT Payload ─────────────────────────────────────────────────────────────

export interface JwtPayload {
  tenantId: string;
  userId: string;
  username: string;
  role: 'builder' | 'player';
  iat?: number;
  exp?: number;
}

// ─── Level Generator Config ───────────────────────────────────────────────────

export interface GeneratorConfig {
  levelId: number;
  episode: number;
  levelsPerEpisode: number;
  isFinalLevel: boolean;
  difficulty: 'easy' | 'normal' | 'hard';
  enemies: EnemyManifest[];
  items: ItemManifest[];
  textures: TextureManifest[];
  seed?: number;
}
