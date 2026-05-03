// Mirrors server types but trimmed to what the game needs

export interface AudioManifest {
  music?: string[];     // filenames in sounds/music/ — played in random order
  playerStep?: string;
  playerDeath?: string;
  levelComplete?: string;
}

export interface TenantConfig {
  tenantId: string;
  name: string;
  logoUrl?: string;
  narrative?: string;
  audio: AudioManifest;
  theme: {
    primaryColor: string;
    accentColor:  string;
    hudColor:     string;
    skyColor:     string;
    floorColor:   string;
  };
  game: {
    title:            string;
    episodes:         number;
    levelsPerEpisode: number;
    startingLives:    number;
    maxHealth:        number;
    maxAmmo:          Record<string, number>;
    weaponRange?:     number; // tiles; 0 or absent = unlimited
  };
  enemies:  EnemyManifest[];
  weapons:  WeaponManifest[];
  items:    ItemManifest[];
  textures: TextureManifest[];
}

export interface EnemyManifest {
  id: string;
  name: string;
  hp: number;
  speed: number;
  attackDamage: number;
  attackRange: number;
  attackCooldown: number;
  sightRange: number;
  isBoss: boolean;
  score: number;
  dropItem: string | null;
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
  fireRate: number;
  ammoType: string;
  ammoPerShot: number;
  behaviorType: 'hitscan' | 'projectile';
  projectileSpeed?: number;
  spread: number;
  frames: number;
  fps: number;
  sounds: {
    fire:    string;
    empty:   string;
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
  path: string;
  type: 'wall' | 'floor' | 'ceiling' | 'door';
}

export interface LevelData {
  levelId:    number;
  name:       string;
  episode:    number;
  grid:       number[][];
  doors:      DoorData[];
  entities:   EntityPlacement[];
  secrets:    SecretWall[];
  elevator:   { x: number; y: number };
  playerStart:{ x: number; y: number; angle: number };
  parTime:    number;
  isFinalLevel: boolean;
  hasBoss:    boolean;
  onLoadMessage?: string;
  onExitMessage?: string;
}

export interface DoorData {
  x: number; y: number;
  orientation: 'horizontal' | 'vertical';
  locked: boolean;
  keyColor?: 'gold' | 'silver';
}

export interface EntityPlacement {
  type: 'enemy' | 'item';
  id: string;
  x: number; y: number;
  facing?: number;
}

export interface SecretWall {
  wallX: number; wallY: number;
  direction: 'north' | 'south' | 'east' | 'west';
  textureId: number;
}

export interface SaveData {
  playerId:       string;
  tenantId:       string;
  savedAt:        string;
  currentLevel:   number;
  currentEpisode: number;
  score:          number;
  lives:          number;
  health:         number;
  weapons:        string[];
  currentWeapon:  string;
  ammo:           Record<string, number>;
  keys:           ('gold' | 'silver')[];
  completedLevels:number[];
  difficulty:     'easy' | 'normal' | 'hard';
  secretsFound:   number;
  kills:          number;
  treasures:      number;
}

// ─── Internal game types ──────────────────────────────────────────────────────

export type GameState = 'MENU' | 'LOADING' | 'PLAYING' | 'PAUSED' | 'DEAD' | 'LEVEL_COMPLETE' | 'WIN' | 'MESSAGE';

export interface Vec2 { x: number; y: number; }

export interface Sprite {
  x: number;
  y: number;
  textureKey: string;
  distance: number;  // filled by renderer
  scale?: number;    // vertical scale (e.g. for small items)
}
