/**
 * Main game orchestrator.
 *
 * Two canvases:
 *  • gameCanvas   — 640×400 internal, scaled by CSS  (ImageData raycaster)
 *  • hudCanvas    — same CSS size, 2D overlay (HUD, menus)
 *
 * Game loop: requestAnimationFrame → update(dt) → render() → HUD.draw()
 */
import type { TenantConfig, LevelData, SaveData, GameState, EntityPlacement, ItemManifest } from '../types/index.ts';
import { Projectile } from './Projectile.ts';
import { GameMap }         from './Map.ts';
import { Player }          from './Player.ts';
import { Enemy }           from './Enemy.ts';
import { WeaponController} from './Weapon.ts';
import { Renderer }        from './Renderer.ts';
import { Input }           from './Input.ts';
import { HUD }             from '../ui/HUD.ts';
import { Menu }            from '../ui/Menu.ts';
import { AudioManager }    from './AudioManager.ts';
import type { MenuAction } from '../ui/Menu.ts';

const RENDER_W = 640;
const RENDER_H = 400;

interface Item { x: number; y: number; manifest: ItemManifest; picked: boolean; }

export class Game {
  private state: GameState = 'MENU';
  private map!:      GameMap;
  private player!:   Player;
  private enemies:         Enemy[]      = [];
  private items:           Item[]       = [];
  private enemyProjectiles: Projectile[] = [];
  private weapon!:   WeaponController;
  private renderer!: Renderer;
  private input!:    Input;
  private hud!:      HUD;
  private menu:      Menu    = new Menu();
  private audio!:    AudioManager;
  private logoImg:   HTMLImageElement | null = null;
  private levelTime    = 0;
  private currentLevel = 1;
  private currentEpisode = 1;
  private difficulty: 'easy' | 'normal' | 'hard' = 'normal';
  private levelCompleteReady = false;
  private levelCompleteAt   = 0;
  private pendingMessage   = '';
  private afterMessage: () => void = () => {};
  private carryOver: {
    health: number; lives: number; score: number;
    kills: number; treasures: number; secretsFound: number;
    ammo: Record<string, number>; weapons: string[]; currentWeaponId: string;
  } | null = null;

  // Overlay canvas for HUD / menus (sits on top, CSS absolute)
  private hudCanvas!:  HTMLCanvasElement;
  private hudCtx!:     CanvasRenderingContext2D;

  constructor(
    private gameCanvas: HTMLCanvasElement,
    private cfg: TenantConfig,
    private tenantId: string,
    private existingSave: SaveData | null
  ) {}

  async init(): Promise<void> {
    // Game canvas — fixed resolution, CSS scales it
    this.gameCanvas.width  = RENDER_W;
    this.gameCanvas.height = RENDER_H;
    this.gameCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;image-rendering:pixelated;';

    // HUD canvas on top
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    this.gameCanvas.parentElement!.appendChild(this.hudCanvas);
    this.hudCtx = this.hudCanvas.getContext('2d')!;

    // Make HUD canvas match physical pixels on resize
    const resizeHud = () => {
      const rect = this.gameCanvas.getBoundingClientRect();
      this.hudCanvas.width  = rect.width  * devicePixelRatio;
      this.hudCanvas.height = rect.height * devicePixelRatio;
      this.hudCtx.scale(devicePixelRatio, devicePixelRatio);
    };
    resizeHud();
    window.addEventListener('resize', resizeHud);

    this.input = new Input(this.gameCanvas);
    this.hud   = new HUD(this.tenantId, this.cfg.theme.hudColor);
    this.audio = new AudioManager(this.tenantId);
    this.audio.preloadAll(this.cfg); // warm audio cache while menu is shown
    await this.hud.loadFaces();

    // Load tenant logo if configured
    if (this.cfg.logoUrl) {
      await new Promise<void>(resolve => {
        const img = new Image();
        img.onload  = () => { this.logoImg = img; resolve(); };
        img.onerror = () => resolve();
        img.src = this.cfg.logoUrl!;
      });
    }

    // Start menu
    this.state = 'MENU';
    requestAnimationFrame(this.loop.bind(this));
  }

  private async loadLevel(levelId: number, episode: number): Promise<void> {
    this.audio.stopMusic();
    const res = await fetch(`/api/game/${this.tenantId}/level/${levelId}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Level ${levelId} not found`);
    const levelData: LevelData = await res.json();

    this.currentLevelData = levelData;
    this.map             = new GameMap(levelData);
    this.enemies         = [];
    this.items           = [];
    this.enemyProjectiles = [];
    this.levelTime       = 0;
    this.currentLevel   = levelId;
    this.currentEpisode = episode;

    // Spawn entities
    for (const placement of levelData.entities) {
      if (placement.type === 'enemy') {
        const manifest = this.cfg.enemies.find(e => e.id === placement.id);
        if (manifest) this.enemies.push(new Enemy(placement.x, placement.y, placement.facing ?? 0, manifest));
      } else if (placement.type === 'item') {
        const manifest = this.cfg.items.find(i => i.id === placement.id);
        if (manifest) this.items.push({ x: placement.x, y: placement.y, manifest, picked: false });
      }
    }

    // Set up renderer and load textures
    this.renderer = new Renderer(this.gameCanvas, RENDER_W, RENDER_H, this.cfg, this.tenantId, 256);
    await this.renderer.loadTextures();

    // Lazy-load sprite textures for visible enemies
    await this.preloadSpriteTextures();

    // Create player
    this.player = new Player(
      levelData.playerStart.x,
      levelData.playerStart.y,
      levelData.playerStart.angle,
      this.cfg
    );
    this.player.difficulty = this.difficulty;

    // Restore save state if applicable (Continue from menu)
    if (this.existingSave && this.existingSave.currentLevel === levelId) {
      this.player.health  = this.existingSave.health;
      this.player.score   = this.existingSave.score;
      this.player.lives   = this.existingSave.lives;
      this.player.ammo    = this.existingSave.ammo;
      this.player.keys    = [...this.existingSave.keys];
      this.player.weapons = [...this.existingSave.weapons];
      this.existingSave   = null;
    }

    // Carry over stats from previous level (normal level progression)
    if (this.carryOver) {
      this.player.health       = this.carryOver.health;
      this.player.lives        = this.carryOver.lives;
      this.player.score        = this.carryOver.score;
      this.player.kills        = this.carryOver.kills;
      this.player.treasures    = this.carryOver.treasures;
      this.player.secretsFound = this.carryOver.secretsFound;
      this.player.ammo         = this.carryOver.ammo;
      this.player.weapons      = this.carryOver.weapons;
      const wIdx = this.carryOver.weapons.indexOf(this.carryOver.currentWeaponId);
      this.player.switchWeapon(wIdx >= 0 ? wIdx : 0);
      this.carryOver = null;
    }

    this.weapon = new WeaponController();
    this.audio.startMusic(this.cfg.audio ?? {});

    if (levelData.onLoadMessage?.trim()) {
      this.showMessage(levelData.onLoadMessage, () => { this.state = 'PLAYING'; });
    } else {
      this.state = 'PLAYING';
    }
  }

  private async preloadSpriteTextures(): Promise<void> {
    const toLoad: [string, string][] = [];

    for (const enemy of this.enemies) {
      const m = enemy.manifest;
      for (let a = 0; a < m.sprites.angles; a++) {
        for (let f = 0; f < m.sprites.walk.frames; f++)
          toLoad.push([`${m.id}/walk_${a}_${f}`, `sprites/enemies/${m.id}/walk_${a}_${f}.webp`]);
        for (let f = 0; f < m.sprites.attack.frames; f++)
          toLoad.push([`${m.id}/attack_${a}_${f}`, `sprites/enemies/${m.id}/attack_${a}_${f}.webp`]);
      }
      for (let f = 0; f < m.sprites.death.frames; f++)
        toLoad.push([`${m.id}/death_${f}`, `sprites/enemies/${m.id}/death_${f}.webp`]);
      toLoad.push([`${m.id}/pain_0`, `sprites/enemies/${m.id}/pain_0.webp`]);
    }

    // Items
    for (const item of this.items) {
      toLoad.push([`item_${item.manifest.id}`, `sprites/items/${item.manifest.id}.webp`]);
    }

    // Weapon frames — all configured weapons
    for (const w of this.cfg.weapons) {
      for (let f = 0; f < w.frames; f++) {
        toLoad.push([`weapon_${w.id}_${f}`, `sprites/weapons/${w.id}/${f}.webp`]);
      }
    }

    await Promise.all(
      toLoad.map(([key, path]) =>
        this.renderer.loadSpriteTexture(key, `/assets/${this.tenantId}/assets/${path}`)
      )
    );

    // Projectile textures — fall back to generic projectile.webp if dedicated files absent
    const base = `/assets/${this.tenantId}/assets/sprites/projectiles`;
    const fallback = `${base}/projectile.webp`;
    await Promise.all([
      this.renderer.loadSpriteTextureWithFallback('player_projectile', `${base}/player_projectile.webp`, fallback),
      this.renderer.loadSpriteTextureWithFallback('enemy_projectile',  `${base}/enemy_projectile.webp`,  fallback),
    ]);
  }

  private lastTime = 0;

  private loop(timestamp: number): void {
    const dt = Math.min(timestamp - this.lastTime, 50); // cap at 50ms (20fps minimum)
    this.lastTime = timestamp;

    this.tick(dt);

    requestAnimationFrame(this.loop.bind(this));
  }

  private tick(dt: number): void {
    const { input } = this;

    switch (this.state) {
      case 'MENU':
        this.tickMenu();
        break;

      case 'PLAYING':
        this.tickGame(dt);
        break;

      case 'PAUSED':
        this.tickPause();
        break;

      case 'LOADING':
        this.drawLoading();
        break;

      case 'DEAD':
        this.drawOverlay();
        if (input.justPressed('Enter')) this.handleStateTransition();
        break;
      case 'LEVEL_COMPLETE':
        this.drawOverlay();
        if (this.levelCompleteReady && performance.now() - this.levelCompleteAt >= 1500) {
          this.handleStateTransition();
        }
        break;
      case 'WIN':
        this.drawOverlay();
        if (input.justPressed('Enter')) this.handleStateTransition();
        break;
      case 'MESSAGE':
        this.tickMessage();
        break;
    }

    input.endFrame();
  }

  // ─── State ticks ──────────────────────────────────────────────────────────

  private tickMenu(): void {
    const { input } = this;
    const sw = this.hudCanvas.width / devicePixelRatio;
    const sh = this.hudCanvas.height / devicePixelRatio;

    this.hudCtx.clearRect(0, 0, sw, sh);

    // Draw a simple darkened background
    if (this.state === 'MENU') {
      this.hudCtx.fillStyle = '#111';
      this.hudCtx.fillRect(0, 0, sw, sh);
    }

    this.menu.draw(this.hudCtx, sw, sh, this.cfg.game.title, this.logoImg, this.cfg.narrative);

    if (input.justPressed('ArrowUp'))   this.menu.navigate('up');
    if (input.justPressed('ArrowDown')) this.menu.navigate('down');
    if (input.justPressed('Enter')) {
      const action = this.menu.select() as MenuAction | null;
      if (action) this.handleMenuAction(action);
    }
  }

  private handleMenuAction(action: MenuAction): void {
    switch (action) {
      case 'newgame':
        // Transitions through difficulty selection — loadLevel called after difficulty chosen
        break;
      case 'easy': case 'normal': case 'hard':
        this.difficulty = action;
        this.existingSave = null;
        this.carryOver    = null;
        this.audio.resume();
        this.menu.reset();
        this.state = 'LOADING';
        this.loadLevel(1, 1).catch(console.error);
        break;
      case 'continue':
        if (this.existingSave) {
          this.difficulty = this.existingSave.difficulty;
          this.audio.resume();
          this.state = 'LOADING';
          this.loadLevel(this.existingSave.currentLevel, this.existingSave.currentEpisode).catch(console.error);
        }
        break;
      case 'save':
        this.saveGame().catch(console.error);
        break;
      case 'quit':
        this.audio.stopMusic();
        window.history.back();
        break;
    }
  }

  private tickPause(): void {
    const { input } = this;
    const sw = this.hudCanvas.width / devicePixelRatio;
    const sh = this.hudCanvas.height / devicePixelRatio;

    this.menu.draw(this.hudCtx, sw, sh, this.cfg.game.title, this.logoImg);

    if (input.justPressed('ArrowUp'))   this.menu.navigate('up');
    if (input.justPressed('ArrowDown')) this.menu.navigate('down');

    if (input.justPressed('Escape') || input.justPressed('KeyP')) {
      this.resumeFromPause();
      input.endFrame();
      return;
    }

    if (input.justPressed('Enter')) {
      const action = this.menu.select() as MenuAction | null;
      if (action === 'resume') {
        this.resumeFromPause();
      } else if (action === 'quit') {
        this.audio.stopMusic();
        this.menu.reset();
        this.state = 'MENU';
      } else if (action) {
        this.handleMenuAction(action);
      }
    }
    input.endFrame();
  }

  private resumeFromPause(): void {
    this.menu.reset();
    this.state = 'PLAYING';
    this.audio.resume();
    this.gameCanvas.requestPointerLock?.();
  }

  private tickGame(dt: number): void {
    const { player, input, map, enemies, items, weapon } = this;

    // Pause
    if (input.justPressed('Escape') || input.justPressed('KeyP')) {
      this.state = 'PAUSED';
      this.menu.enterPause();
      input.releaseLock();
      return;
    }

    // Weapon switch (number keys)
    for (let i = 0; i < 9; i++) {
      if (input.justPressed(`Digit${i + 1}`)) player.switchWeapon(i);
    }

    // Update subsystems
    map.update(dt);
    player.update(dt, map, input);
    this.levelTime += dt;

    // Player footsteps — AudioManager prevents stacking; sound duration sets cadence
    const moving = input.isDown('KeyW') || input.isDown('KeyS') ||
                   input.isDown('KeyA') || input.isDown('KeyD') ||
                   input.isDown('ArrowUp') || input.isDown('ArrowDown');
    if (moving) this.audio.playerStep(this.cfg.audio ?? {});

    // Door interaction (Space)
    if (input.justPressed('Space') || input.justPressed('KeyE')) {
      const gx = Math.floor(player.x + player.dirX * 1.2);
      const gy = Math.floor(player.y + player.dirY * 1.2);
      map.tryOpenDoor(gx, gy, player.hasKey('gold'), player.hasKey('silver'));
    }

    // Save (F5)
    if (input.justPressed('F5')) {
      this.saveGame().catch(console.error);
    }

    // Enemies
    for (const e of enemies) e.update(dt, player, map, this.audio, this.enemyProjectiles);

    // Update enemy projectiles (no damage dealt — already done in Enemy.update)
    for (const p of this.enemyProjectiles) p.update(dt, map, [], player, false);
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      if (!this.enemyProjectiles[i]!.alive) this.enemyProjectiles.splice(i, 1);
    }

    // Weapon + firing
    const firing = input.isMouseDown(0) || input.isDown('ControlLeft') || input.isDown('ControlRight');
    const weaponRange = this.cfg.game.weaponRange ?? 0;
    weapon.update(dt, player, enemies, map, firing, this.audio, weaponRange);

    // Item pickups
    for (const item of items) {
      if (item.picked) continue;
      const dx = item.x - player.x; const dy = item.y - player.y;
      if (Math.sqrt(dx * dx + dy * dy) < 0.6) {
        this.pickupItem(item);
      }
    }

    // Elevator check
    if (map.isAtElevator(player.x, player.y)) {
      this.enterLevelComplete();
    }

    // Player death
    if (player.health <= 0) {
      this.audio.playerDeath(this.cfg.audio ?? {});
      this.audio.stopMusic();
      this.state = player.lives <= 0 ? 'MENU' : 'DEAD';
      input.releaseLock();
    }

    // Render world — build item sprite list (unpicked only)
    const itemSprites = this.items
      .filter(i => !i.picked)
      .map(i => ({ x: i.x, y: i.y, textureKey: `item_${i.manifest.id}`, scale: 0.65, grounded: true }));
    const allProjectiles = [...weapon.projectiles, ...this.enemyProjectiles];
    this.renderer.render(player, map, enemies, allProjectiles, itemSprites, {
      key: `weapon_${player.currentWeapon.id}_${weapon.frame}`,
      bobX: weapon.bobX,
      bobY: weapon.bobY,
    });

    // HUD overlay
    const rect        = this.gameCanvas.getBoundingClientRect();
    const sw          = rect.width;
    const sh          = rect.height;
    const totalLevels = this.cfg.game.episodes * this.cfg.game.levelsPerEpisode;
    const globalLevel = (this.currentEpisode - 1) * this.cfg.game.levelsPerEpisode + this.currentLevel;
    this.hudCtx.clearRect(0, 0, sw, sh);
    this.hud.draw(this.hudCtx, player, sw, sh, this.levelTime / 1000, this.currentLevelData?.parTime ?? 300, globalLevel, totalLevels);
    this.hud.drawReticle(this.hudCtx, sw, sh, weapon.reticleAlpha);
  }

  private drawOverlay(): void {
    const sw = this.hudCanvas.width / devicePixelRatio;
    const sh = this.hudCanvas.height / devicePixelRatio;
    this.hudCtx.clearRect(0, 0, sw, sh);
    Menu.drawStateOverlay(this.hudCtx, sw, sh, this.state, `LEVEL ${this.currentLevel} COMPLETE`);
  }

  private drawLoading(): void {
    const sw = this.hudCanvas.width / devicePixelRatio;
    const sh = this.hudCanvas.height / devicePixelRatio;
    this.hudCtx.clearRect(0, 0, sw, sh);
    Menu.drawLoading(this.hudCtx, sw, sh, this.cfg.game.title, this.logoImg);
  }

  private handleStateTransition(): void {
    switch (this.state) {
      case 'DEAD':
        this.existingSave = null;
        this.carryOver    = null;
        this.state = 'LOADING';
        this.loadLevel(this.currentLevel, this.currentEpisode).catch(console.error);
        break;
      case 'LEVEL_COMPLETE': {
        this.carryOver = {
          health:       this.player.health,
          lives:        this.player.lives,
          score:        this.player.score,
          kills:        this.player.kills,
          treasures:    this.player.treasures,
          secretsFound: this.player.secretsFound,
          ammo:         { ...this.player.ammo },
          weapons:      [...this.player.weapons],
          currentWeaponId: this.player.currentWeapon.id,
        };
        const nextLevel = this.currentLevel + 1;
        const levelsPerEp = this.cfg.game.levelsPerEpisode;
        if (nextLevel > levelsPerEp) {
          if (this.currentEpisode < this.cfg.game.episodes) {
            this.state = 'LOADING';
            this.loadLevel(1, this.currentEpisode + 1).catch(console.error);
          } else {
            this.state = 'WIN';
          }
        } else {
          this.state = 'LOADING';
          this.loadLevel(nextLevel, this.currentEpisode).catch(console.error);
        }
        break;
      }
      case 'WIN':
        this.state = 'MENU';
        this.audio.stopMusic();
        this.menu.reset();
        break;
    }
  }

  private showMessage(text: string, next: () => void): void {
    this.pendingMessage = text;
    this.afterMessage   = next;
    this.state = 'MESSAGE';
    this.input.releaseLock();
  }

  private tickMessage(): void {
    const { input } = this;
    const sw = this.hudCanvas.width / devicePixelRatio;
    const sh = this.hudCanvas.height / devicePixelRatio;
    this.hudCtx.clearRect(0, 0, sw, sh);
    Menu.drawMessageOverlay(this.hudCtx, sw, sh, this.pendingMessage, this.cfg.theme.primaryColor);
    if (input.justPressed('Enter') || input.justPressed('Space')) {
      const next = this.afterMessage;
      this.pendingMessage = '';
      this.afterMessage   = () => {};
      next();
    }
  }

  private enterLevelComplete(exitManifest?: ItemManifest): void {
    if (this.state === 'LEVEL_COMPLETE' || this.state === 'MESSAGE') return;
    const exitMsg = this.currentLevelData?.onExitMessage?.trim();
    if (exitMsg) {
      this.showMessage(exitMsg, () => this.doEnterLevelComplete(exitManifest));
    } else {
      this.doEnterLevelComplete(exitManifest);
    }
  }

  private doEnterLevelComplete(exitManifest?: ItemManifest): void {
    this.levelCompleteReady = false;
    this.levelCompleteAt   = performance.now();
    this.state = 'LEVEL_COMPLETE';
    this.input.releaseLock();
    // Use exit item's pickup sound if present, otherwise the global level-complete jingle
    const sound = exitManifest
      ? this.audio.itemPickupWait(exitManifest)
      : this.audio.levelComplete(this.cfg.audio ?? {});
    sound.then(() => { this.levelCompleteReady = true; });
  }

  private pickupItem(item: Item): void {
    item.picked = true;
    const m = item.manifest;
    if (m.type === 'exit') {
      this.enterLevelComplete(m);
      return;
    }
    this.audio.itemPickup(m);
    switch (m.type) {
      case 'health':   this.player.heal(m.value);               break;
      case 'ammo':     this.player.addAmmo(m.ammoType!, m.value); break;
      case 'key':      this.player.pickupKey(m.keyColor!);        break;
      case 'life':     this.player.lives += m.value;             break;
      case 'treasure': this.player.treasures++;                  break;
    }
    this.player.score += m.score;
  }

  private currentLevelData: LevelData | null = null;

  private async saveGame(): Promise<void> {
    const save: Omit<SaveData, 'playerId' | 'tenantId' | 'savedAt'> = {
      currentLevel:    this.currentLevel,
      currentEpisode:  this.currentEpisode,
      score:           this.player.score,
      lives:           this.player.lives,
      health:          this.player.health,
      weapons:         this.player.weapons,
      currentWeapon:   this.player.currentWeapon.id,
      ammo:            this.player.ammo,
      keys:            this.player.keys,
      completedLevels: [],
      difficulty:      this.difficulty,
      secretsFound:    this.player.secretsFound,
      kills:           this.player.kills,
      treasures:       this.player.treasures,
    };
    await fetch(`/api/game/${this.tenantId}/save`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(save),
    });
  }
}
