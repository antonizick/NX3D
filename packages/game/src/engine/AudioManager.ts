import type { AudioManifest, EnemyManifest, WeaponManifest, ItemManifest, TenantConfig } from '../types/index.ts';

export class AudioManager {
  private _ctx: AudioContext | null = null;
  private cache       = new Map<string, AudioBuffer | null>();
  private pending     = new Map<string, Promise<AudioBuffer | null>>();
  private musicSrc: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTracks: string[] = [];
  private musicActive = false;
  private musicGeneration = 0;
  /** Tracks currently-playing step sounds by key to prevent stacking. */
  private stepSources = new Map<string, AudioBufferSourceNode>();

  constructor(private tenantId: string) {}

  private get ctx(): AudioContext {
    if (!this._ctx) this._ctx = new AudioContext();
    return this._ctx;
  }

  resume(): void {
    this._ctx?.resume().catch(() => {});
    if (!this._ctx) {
      // Lazily create so AudioContext exists after user gesture
      try { this.ctx; } catch { /* ignore */ }
    }
  }

  private url(category: string, subId: string | null, filename: string): string {
    const base = `/assets/${this.tenantId}/assets/${category}`;
    return subId ? `${base}/${subId}/${filename}` : `${base}/${filename}`;
  }

  private load(url: string): Promise<AudioBuffer | null> {
    if (this.cache.has(url)) return Promise.resolve(this.cache.get(url) ?? null);
    if (this.pending.has(url)) return this.pending.get(url)!;

    const p = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) { this.cache.set(url, null); return null; }
        const raw     = await res.arrayBuffer();
        const decoded = await this.ctx.decodeAudioData(raw);
        this.cache.set(url, decoded);
        return decoded;
      } catch {
        this.cache.set(url, null);
        return null;
      } finally {
        this.pending.delete(url);
      }
    })();

    this.pending.set(url, p);
    return p;
  }

  private fire(url: string, volume = 1.0): void {
    this.load(url).then(buf => {
      if (!buf) return;
      try {
        const ctx  = this.ctx;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1.5, volume));
        gain.connect(ctx.destination);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(gain);
        src.start();
      } catch { /* AudioContext closed */ }
    }).catch(() => {});
  }

  private fireAndWait(url: string, volume = 1.0): Promise<void> {
    return this.load(url).then(buf => {
      if (!buf) return;
      return new Promise<void>(resolve => {
        try {
          const ctx  = this.ctx;
          const gain = ctx.createGain();
          gain.gain.value = Math.max(0, Math.min(1.5, volume));
          gain.connect(ctx.destination);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(gain);
          src.onended = () => resolve();
          src.start();
        } catch { resolve(); }
      });
    }).catch(() => {});
  }

  /**
   * Play a step/footstep sound that must not stack — if the sound for `key`
   * is already playing, this call is ignored until that instance ends.
   * The sound file's own duration controls the repeat cadence naturally.
   */
  private step(key: string, soundUrl: string, volume: number): void {
    if (this.stepSources.has(key)) return; // still playing, skip
    this.load(soundUrl).then(buf => {
      if (!buf || this.stepSources.has(key)) return;
      try {
        const ctx  = this.ctx;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1.5, volume));
        gain.connect(ctx.destination);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(gain);
        src.onended = () => this.stepSources.delete(key);
        src.start();
        this.stepSources.set(key, src);
      } catch {
        this.stepSources.delete(key);
      }
    }).catch(() => {});
  }

  // ── Enemy ─────────────────────────────────────────────────────────────────

  enemyAlert(m: EnemyManifest): void {
    if (m.sounds?.alert) this.fire(this.url('sounds/enemies', m.id, m.sounds.alert));
  }

  enemyPain(m: EnemyManifest): void {
    if (m.sounds?.pain) this.fire(this.url('sounds/enemies', m.id, m.sounds.pain), 0.8);
  }

  enemyDeath(m: EnemyManifest): void {
    if (m.sounds?.death) this.fire(this.url('sounds/enemies', m.id, m.sounds.death));
  }

  enemyAttack(m: EnemyManifest): void {
    if (m.sounds?.attack) this.fire(this.url('sounds/enemies', m.id, m.sounds.attack), 0.7);
  }

  enemyStep(m: EnemyManifest, distanceFactor: number): void {
    if (m.sounds?.step && distanceFactor > 0) {
      this.step(`enemy-${m.id}`, this.url('sounds/enemies', m.id, m.sounds.step), distanceFactor * 0.45);
    }
  }

  // ── Weapon ────────────────────────────────────────────────────────────────

  weaponFire(m: WeaponManifest): void {
    if (m.sounds?.fire) this.fire(this.url('sounds/weapons', m.id, m.sounds.fire));
  }

  weaponEmpty(m: WeaponManifest): void {
    if (m.sounds?.empty) this.fire(this.url('sounds/weapons', m.id, m.sounds.empty), 0.5);
  }

  // ── Item ──────────────────────────────────────────────────────────────────

  itemPickup(m: ItemManifest): void {
    if (m.sounds?.pickup) this.fire(this.url('sounds/items', m.id, m.sounds.pickup));
  }

  itemPickupWait(m: ItemManifest): Promise<void> {
    if (m.sounds?.pickup) return this.fireAndWait(this.url('sounds/items', m.id, m.sounds.pickup));
    return Promise.resolve();
  }

  // ── Player ────────────────────────────────────────────────────────────────

  playerStep(a: AudioManifest): void {
    if (a.playerStep) this.step('player', this.url('sounds/player', null, a.playerStep), 0.4);
  }

  playerDeath(a: AudioManifest): void {
    if (a.playerDeath) this.fire(this.url('sounds/player', null, a.playerDeath));
  }

  levelComplete(a: AudioManifest): Promise<void> {
    if (a.levelComplete) return this.fireAndWait(this.url('sounds/player', null, a.levelComplete));
    return Promise.resolve();
  }

  // ── Music ─────────────────────────────────────────────────────────────────

  startMusic(a: AudioManifest): void {
    this.stopMusic();
    // Normalise: accept legacy string or new string[]
    const raw = a.music;
    const tracks = Array.isArray(raw) ? raw.filter(Boolean) : raw ? [raw] : [];
    if (!tracks.length) return;
    this.musicTracks = tracks;
    this.musicActive = true;
    this.playMusicTrack(this.musicGeneration);
  }

  private playMusicTrack(generation: number, exclude?: string): void {
    if (!this.musicActive || generation !== this.musicGeneration) return;
    const pool = this.musicTracks.length > 1
      ? this.musicTracks.filter(t => t !== exclude)
      : this.musicTracks;
    const track = pool[Math.floor(Math.random() * pool.length)]!;
    const u = this.url('sounds/music', null, track);
    this.load(u).then(buf => {
      if (!buf || !this.musicActive || generation !== this.musicGeneration) return;
      try {
        const ctx = this.ctx;
        this.musicGain = ctx.createGain();
        this.musicGain.gain.value = 0.25;
        this.musicGain.connect(ctx.destination);
        this.musicSrc = ctx.createBufferSource();
        this.musicSrc.buffer = buf;
        this.musicSrc.connect(this.musicGain);
        this.musicSrc.onended = () => { if (this.musicActive) this.playMusicTrack(generation, track); };
        this.musicSrc.start();
      } catch { /* ignore */ }
    }).catch(() => {});
  }

  stopMusic(): void {
    this.musicActive = false;
    this.musicGeneration++;
    try { this.musicSrc?.stop(); } catch { /* already stopped */ }
    this.musicSrc  = null;
    this.musicGain = null;
  }

  /** Eagerly fetch + decode all audio from cfg into cache while on the menu screen. Fire-and-forget. */
  preloadAll(cfg: TenantConfig): void {
    const urls: string[] = [];

    for (const e of cfg.enemies) {
      if (e.sounds?.alert)  urls.push(this.url('sounds/enemies', e.id, e.sounds.alert));
      if (e.sounds?.pain)   urls.push(this.url('sounds/enemies', e.id, e.sounds.pain));
      if (e.sounds?.death)  urls.push(this.url('sounds/enemies', e.id, e.sounds.death));
      if (e.sounds?.attack) urls.push(this.url('sounds/enemies', e.id, e.sounds.attack));
      if (e.sounds?.step)   urls.push(this.url('sounds/enemies', e.id, e.sounds.step));
    }

    for (const w of cfg.weapons) {
      if (w.sounds?.fire)   urls.push(this.url('sounds/weapons', w.id, w.sounds.fire));
      if (w.sounds?.empty)  urls.push(this.url('sounds/weapons', w.id, w.sounds.empty));
      if (w.sounds?.reload) urls.push(this.url('sounds/weapons', w.id, w.sounds.reload));
    }

    for (const i of cfg.items) {
      if (i.sounds?.pickup) urls.push(this.url('sounds/items', i.id, i.sounds.pickup));
    }

    const a = cfg.audio ?? {};
    if (a.playerStep)    urls.push(this.url('sounds/player', null, a.playerStep));
    if (a.playerDeath)   urls.push(this.url('sounds/player', null, a.playerDeath));
    if (a.levelComplete) urls.push(this.url('sounds/player', null, a.levelComplete));

    const tracks = Array.isArray(a.music) ? a.music : a.music ? [a.music as string] : [];
    for (const t of tracks) {
      if (t) urls.push(this.url('sounds/music', null, t));
    }

    for (const u of urls) this.load(u).catch(() => {});
  }

  destroy(): void {
    this.stopMusic();
    this._ctx?.close().catch(() => {});
    this._ctx = null;
  }
}
