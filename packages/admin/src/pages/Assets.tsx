import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, Upload, Loader2, RotateCcw, Volume2, Music } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Input }  from '@/components/ui/input.tsx';
import { Label }  from '@/components/ui/label.tsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs.tsx';
import { AssetUploader } from '@/components/AssetUploader.tsx';
import { assetsApi, tenantsApi } from '@/lib/api.ts';
import { useTenant } from '@/contexts/TenantContext.tsx';

const CATEGORIES = [
  { key: 'textures',                label: 'Textures' },
  { key: 'sprites/enemies',         label: 'Enemies' },
  { key: 'sprites/weapons',         label: 'Weapons' },
  { key: 'sprites/items',           label: 'Items' },
  { key: 'sprites/player_portraits',label: 'Portraits' },
  { key: 'sprites/projectiles',     label: 'Projectiles' },
] as const;

const TEXTURE_LABELS: Record<string, string> = {
  'ceiling.webp':    'Wall Tile 1',
  'floor_tile.webp': 'Wall Tile 2',
  'door.webp':       'Wall Tile 3',
  'wall_brick.webp': 'Wall Tile 4',
  'wall_stone.webp': 'Wall Tile 5',
  'wall_wood.webp':  'Wall Tile 6',
};

const PORTRAIT_LABELS: Record<string, string> = {
  'face_100.webp': 'Healthy (100%)',
  'face_80.webp':  'Lightly Hurt (80%)',
  'face_60.webp':  'Hurt (60%)',
  'face_40.webp':  'Badly Hurt (40%)',
  'face_20.webp':  'Critical (20%)',
  'face_0.webp':   'Dead (0%)',
};

const PROJECTILE_LABELS: Record<string, string> = {
  'player_projectile.webp': 'User Projectile',
  'enemy_projectile.webp':  'Adversary Projectile',
  'projectile.webp':        'Projectile (legacy)',
};

function toReadable(filename: string): string {
  return filename
    .replace(/\.webp$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function labelForFile(category: string, filename: string): string {
  if (category === 'textures') return TEXTURE_LABELS[filename] ?? toReadable(filename);
  if (category === 'sprites/player_portraits') return PORTRAIT_LABELS[filename] ?? toReadable(filename);
  if (category === 'sprites/projectiles') return PROJECTILE_LABELS[filename] ?? toReadable(filename);
  return toReadable(filename);
}

// ─── Sound slot component ─────────────────────────────────────────────────────

interface SoundSlotProps {
  label: string;
  filename: string;
  busy: boolean;
  previewUrl?: string;
  onUpload: (file: File) => void;
  onDelete?: () => void;
}

function SoundSlot({ label, filename, busy, previewUrl, onUpload, onDelete }: SoundSlotProps) {
  const ref = useRef<HTMLInputElement>(null);

  const handlePlay = () => {
    if (!previewUrl) return;
    new Audio(previewUrl).play().catch(() => toast.error('Could not play audio'));
  };

  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <div className="w-28 shrink-0 text-sm font-medium capitalize text-muted-foreground">{label}</div>
      <div className="flex-1 min-w-0">
        {filename
          ? <span className="font-mono text-xs text-green-600 dark:text-green-400 truncate block">{filename}</span>
          : <span className="text-xs italic text-muted-foreground">not set</span>}
      </div>
      <div className="flex gap-1 shrink-0">
        {filename && previewUrl && (
          <Button size="sm" variant="ghost" title="Preview" onClick={handlePlay} disabled={busy}>
            <Volume2 className="h-3 w-3" />
          </Button>
        )}
        <input
          ref={ref}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onUpload(f);
          }}
        />
        <Button
          size="sm"
          variant={filename ? 'outline' : 'default'}
          disabled={busy}
          title={filename ? 'Replace' : 'Upload'}
          onClick={() => ref.current?.click()}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        </Button>
        {filename && onDelete && (
          <Button size="sm" variant="destructive" disabled={busy} onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Music track add button ───────────────────────────────────────────────────

function MusicTrackUpload({ busy, onUpload }: { busy: boolean; onUpload: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }}
      />
      <Button size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
        Add Track
      </Button>
    </>
  );
}

// ─── Audio tab ───────────────────────────────────────────────────────────────

function AudioTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [selectedEnemyId, setSelectedEnemyId] = useState('');
  const [selectedWeaponId, setSelectedWeaponId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const { data: cfg, refetch } = useQuery<any>({
    queryKey: ['tenant-cfg', tenantId],
    queryFn:  () => tenantsApi.get(tenantId),
    enabled:  !!tenantId,
  });

  useEffect(() => {
    if (cfg?.enemies?.[0] && !selectedEnemyId) setSelectedEnemyId(cfg.enemies[0].id);
    if (cfg?.weapons?.[0] && !selectedWeaponId) setSelectedWeaponId(cfg.weapons[0].id);
    if (cfg?.items?.[0] && !selectedItemId) setSelectedItemId(cfg.items[0].id);
  }, [cfg?.enemies, cfg?.weapons, cfg?.items]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveConfig = async (newCfg: unknown) => {
    await tenantsApi.update(tenantId, newCfg);
    await refetch();
    qc.invalidateQueries({ queryKey: ['tenant-cfg', tenantId] });
  };

  const handleUpload = async (
    category: string,
    subId: string | undefined,
    slotKey: string,
    file: File
  ) => {
    const ext  = file.name.includes('.') ? file.name.split('.').pop()! : 'mp3';
    const named = new File([file], `${slotKey}.${ext}`, { type: file.type });
    const busyKey = `${category}/${subId ?? ''}/${slotKey}`;
    setBusy(busyKey);
    try {
      await assetsApi.upload(tenantId, category, [named], subId);
      const filename = `${slotKey}.${ext}`;
      const next = JSON.parse(JSON.stringify(cfg));
      applySoundToConfig(next, category, subId, slotKey, filename);
      await saveConfig(next);
      toast.success('Sound uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (
    category: string,
    subId: string | undefined,
    slotKey: string,
    filename: string
  ) => {
    const busyKey = `${category}/${subId ?? ''}/${slotKey}`;
    setBusy(busyKey);
    try {
      await assetsApi.delete(tenantId, category, filename, subId);
      const next = JSON.parse(JSON.stringify(cfg));
      applySoundToConfig(next, category, subId, slotKey, '');
      await saveConfig(next);
      toast.success('Sound removed');
    } catch {
      toast.error('Delete failed');
    } finally {
      setBusy(null);
    }
  };

  function applySoundToConfig(config: any, category: string, subId: string | undefined, slotKey: string, value: string) {
    if (category === 'sounds/music') {
      config.audio = { ...config.audio, music: value };
    } else if (category === 'sounds/player') {
      if (slotKey === 'step')           config.audio = { ...config.audio, playerStep: value };
      if (slotKey === 'death')          config.audio = { ...config.audio, playerDeath: value };
      if (slotKey === 'level_complete') config.audio = { ...config.audio, levelComplete: value };
    } else if (category === 'sounds/enemies' && subId) {
      const e = config.enemies?.find((x: any) => x.id === subId);
      if (e) e.sounds = { ...e.sounds, [slotKey]: value };
    } else if (category === 'sounds/weapons' && subId) {
      const w = config.weapons?.find((x: any) => x.id === subId);
      if (w) w.sounds = { ...w.sounds, [slotKey]: value };
    } else if (category === 'sounds/items' && subId) {
      const item = config.items?.find((x: any) => x.id === subId);
      if (item) item.sounds = { ...item.sounds, [slotKey]: value };
    }
  }

  function slotUrl(category: string, subId: string | undefined, filename: string): string | undefined {
    if (!filename) return undefined;
    return `/assets/${tenantId}/assets/${category}${subId ? '/' + subId : ''}/${filename}`;
  }

  function isBusy(category: string, subId: string | undefined, key: string): boolean {
    return busy === `${category}/${subId ?? ''}/${key}`;
  }

  if (!cfg) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const audio = cfg.audio ?? {};
  const selectedEnemy  = cfg.enemies?.find((e: any) => e.id === selectedEnemyId);
  const selectedWeapon = cfg.weapons?.find((w: any) => w.id === selectedWeaponId);
  const selectedItem   = cfg.items?.find((i: any) => i.id === selectedItemId);

  return (
    <div className="space-y-8">

      {/* Background Music */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Music className="h-4 w-4" />
          <h3 className="font-semibold">Background Music</h3>
        </div>
        <div className="border rounded-md px-4 py-1">
          {(Array.isArray(audio.music) ? audio.music : audio.music ? [audio.music] : []).map((track: string) => (
            <SoundSlot
              key={track}
              label={track}
              filename={track}
              busy={busy === `sounds/music//${track}`}
              previewUrl={slotUrl('sounds/music', undefined, track)}
              onUpload={async f => {
                setBusy(`sounds/music//${track}`);
                try {
                  const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                  await assetsApi.upload(tenantId, 'sounds/music', [new File([f], safe, { type: f.type })]);
                  const next = JSON.parse(JSON.stringify(cfg));
                  const list: string[] = Array.isArray(next.audio?.music) ? next.audio.music : next.audio?.music ? [next.audio.music] : [];
                  const idx = list.indexOf(track);
                  if (idx !== -1) list[idx] = safe;
                  next.audio = { ...next.audio, music: list };
                  await saveConfig(next);
                  toast.success('Track replaced');
                } catch { toast.error('Upload failed'); } finally { setBusy(null); }
              }}
              onDelete={async () => {
                setBusy(`sounds/music//${track}`);
                try {
                  await assetsApi.delete(tenantId, 'sounds/music', track, undefined);
                  const next = JSON.parse(JSON.stringify(cfg));
                  const list: string[] = Array.isArray(next.audio?.music) ? next.audio.music : [];
                  next.audio = { ...next.audio, music: list.filter((t: string) => t !== track) };
                  await saveConfig(next);
                  toast.success('Track removed');
                } catch { toast.error('Delete failed'); } finally { setBusy(null); }
              }}
            />
          ))}
          {(Array.isArray(audio.music) ? audio.music : audio.music ? [audio.music] : []).length === 0 && (
            <p className="text-xs italic text-muted-foreground py-2">No tracks uploaded yet</p>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <MusicTrackUpload
            busy={busy === 'sounds/music//add'}
            onUpload={async f => {
              setBusy('sounds/music//add');
              try {
                const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                await assetsApi.upload(tenantId, 'sounds/music', [new File([f], safe, { type: f.type })]);
                const next = JSON.parse(JSON.stringify(cfg));
                const list: string[] = Array.isArray(next.audio?.music) ? next.audio.music : next.audio?.music ? [next.audio.music] : [];
                if (!list.includes(safe)) list.push(safe);
                next.audio = { ...next.audio, music: list };
                await saveConfig(next);
                toast.success('Track added');
              } catch { toast.error('Upload failed'); } finally { setBusy(null); }
            }}
          />
          <p className="text-xs text-muted-foreground">Tracks play in random order and advance automatically. Accepts MP3, OGG, WAV.</p>
        </div>
      </section>

      {/* Player Sounds */}
      <section>
        <h3 className="font-semibold mb-3">Player Sounds</h3>
        <div className="border rounded-md px-4 py-1">
          {([
            { key: 'step',           label: 'Footstep',        field: 'playerStep' },
            { key: 'death',          label: 'Player Death',     field: 'playerDeath' },
            { key: 'level_complete', label: 'Level Completed',  field: 'levelComplete' },
          ] as const).map(({ key, label, field }) => (
            <SoundSlot
              key={key}
              label={label}
              filename={audio[field] ?? ''}
              busy={isBusy('sounds/player', undefined, key)}
              previewUrl={slotUrl('sounds/player', undefined, audio[field])}
              onUpload={f => handleUpload('sounds/player', undefined, key, f)}
              onDelete={audio[field] ? () => handleDelete('sounds/player', undefined, key, audio[field]) : undefined}
            />
          ))}
        </div>
      </section>

      {/* Enemy Sounds */}
      <section>
        <h3 className="font-semibold mb-3">Enemy Sounds</h3>
        {cfg.enemies?.length > 0 ? (
          <>
            <div className="flex gap-2 flex-wrap mb-3">
              {cfg.enemies.map((e: any) => (
                <Button
                  key={e.id}
                  size="sm"
                  variant={selectedEnemyId === e.id ? 'default' : 'outline'}
                  onClick={() => setSelectedEnemyId(e.id)}
                >
                  {e.name}
                </Button>
              ))}
            </div>
            {selectedEnemy && (
              <div className="border rounded-md px-4 py-1">
                {([
                  { key: 'alert',  label: 'Alert / Spot' },
                  { key: 'pain',   label: 'Pain' },
                  { key: 'death',  label: 'Death' },
                  { key: 'attack', label: 'Attack' },
                  { key: 'step',   label: 'Footstep' },
                ] as const).map(({ key, label }) => (
                  <SoundSlot
                    key={key}
                    label={label}
                    filename={selectedEnemy.sounds?.[key] ?? ''}
                    busy={isBusy('sounds/enemies', selectedEnemyId, key)}
                    previewUrl={slotUrl('sounds/enemies', selectedEnemyId, selectedEnemy.sounds?.[key])}
                    onUpload={f => handleUpload('sounds/enemies', selectedEnemyId, key, f)}
                    onDelete={selectedEnemy.sounds?.[key]
                      ? () => handleDelete('sounds/enemies', selectedEnemyId, key, selectedEnemy.sounds[key])
                      : undefined}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No enemies configured.</p>
        )}
      </section>

      {/* Weapon Sounds */}
      <section>
        <h3 className="font-semibold mb-3">Weapon Sounds</h3>
        {cfg.weapons?.length > 0 ? (
          <>
            <div className="flex gap-2 flex-wrap mb-3">
              {cfg.weapons.map((w: any) => (
                <Button
                  key={w.id}
                  size="sm"
                  variant={selectedWeaponId === w.id ? 'default' : 'outline'}
                  onClick={() => setSelectedWeaponId(w.id)}
                >
                  {w.name}
                </Button>
              ))}
            </div>
            {selectedWeapon && (
              <div className="border rounded-md px-4 py-1">
                {([
                  { key: 'fire',   label: 'Fire' },
                  { key: 'empty',  label: 'Empty Click' },
                  { key: 'reload', label: 'Reload' },
                ] as const).map(({ key, label }) => (
                  <SoundSlot
                    key={key}
                    label={label}
                    filename={selectedWeapon.sounds?.[key] ?? ''}
                    busy={isBusy('sounds/weapons', selectedWeaponId, key)}
                    previewUrl={slotUrl('sounds/weapons', selectedWeaponId, selectedWeapon.sounds?.[key])}
                    onUpload={f => handleUpload('sounds/weapons', selectedWeaponId, key, f)}
                    onDelete={selectedWeapon.sounds?.[key]
                      ? () => handleDelete('sounds/weapons', selectedWeaponId, key, selectedWeapon.sounds[key])
                      : undefined}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No weapons configured.</p>
        )}
      </section>

      {/* Item Pickup Sounds */}
      <section>
        <h3 className="font-semibold mb-3">Item Pickup Sounds</h3>
        {cfg.items?.length > 0 ? (
          <>
            <div className="flex gap-2 flex-wrap mb-3">
              {cfg.items.map((i: any) => (
                <Button
                  key={i.id}
                  size="sm"
                  variant={selectedItemId === i.id ? 'default' : 'outline'}
                  onClick={() => setSelectedItemId(i.id)}
                >
                  {i.name}
                </Button>
              ))}
            </div>
            {selectedItem && (
              <div className="border rounded-md px-4 py-1">
                <SoundSlot
                  label="Pickup"
                  filename={selectedItem.sounds?.pickup ?? ''}
                  busy={isBusy('sounds/items', selectedItemId, 'pickup')}
                  previewUrl={slotUrl('sounds/items', selectedItemId, selectedItem.sounds?.pickup)}
                  onUpload={f => handleUpload('sounds/items', selectedItemId, 'pickup', f)}
                  onDelete={selectedItem.sounds?.pickup
                    ? () => handleDelete('sounds/items', selectedItemId, 'pickup', selectedItem.sounds.pickup)
                    : undefined}
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No items configured.</p>
        )}
      </section>
    </div>
  );
}

// ─── Main Assets page ─────────────────────────────────────────────────────────

export function Assets() {
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('textures');
  const [subId, setSubId] = useState('');
  const [replacing, setReplacing] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [imgBuster, setImgBuster] = useState(0);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string>('');

  const needsSubId = activeTab === 'sprites/enemies' || activeTab === 'sprites/weapons';

  const { data: subIdData } = useQuery({
    queryKey: ['assets', tenantId, activeTab, '__subids__'],
    queryFn:  () => assetsApi.list(tenantId, activeTab, undefined),
    enabled:  !!tenantId && needsSubId,
  });
  const availableSubIds: string[] = subIdData?.files ?? [];

  useEffect(() => {
    if (needsSubId && availableSubIds.length > 0 && !subId) {
      setSubId(availableSubIds[0]!);
    }
  }, [needsSubId, availableSubIds[0], subId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, refetch } = useQuery({
    queryKey: ['assets', tenantId, activeTab, subId],
    queryFn:  () => assetsApi.list(tenantId, activeTab, subId || undefined),
    enabled:  !!tenantId && activeTab !== 'audio' && (!needsSubId || !!subId),
  });

  const files: string[] = data?.files ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['assets', tenantId, activeTab] });
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await assetsApi.delete(tenantId, activeTab, filename, subId || undefined);
      toast.success('Deleted');
      refetch();
      invalidate();
      setImgBuster(Date.now());
    } catch {
      toast.error('Delete failed');
    }
  };

  const handleResetToDefault = async (filename: string) => {
    setResetting(filename);
    try {
      await assetsApi.resetToDefault(tenantId, activeTab, filename, subId || undefined);
      toast.success(`Reset ${labelForFile(activeTab, filename)} to default`);
      refetch();
      invalidate();
      setImgBuster(Date.now());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed';
      toast.error(msg.includes('No default') ? 'No default exists for this asset' : 'Reset failed');
    } finally {
      setResetting(null);
    }
  };

  const handleReplaceClick = (filename: string) => {
    replaceTargetRef.current = filename;
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const targetFilename = replaceTargetRef.current;
    setReplacing(targetFilename);
    try {
      const renamed = new File([file], targetFilename, { type: file.type });
      await assetsApi.upload(tenantId, activeTab, [renamed], subId || undefined);
      toast.success(`Replaced ${labelForFile(activeTab, targetFilename)}`);
      refetch();
      invalidate();
      setImgBuster(Date.now());
    } catch {
      toast.error(`Replace failed for ${targetFilename}`);
    } finally {
      setReplacing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assets</h1>
        <p className="text-muted-foreground">Upload and manage game assets</p>
      </div>

      {/* Shared hidden input for per-asset image replacement */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleReplaceFile}
      />

      <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setSubId(''); }}>
        <TabsList>
          {CATEGORIES.map(c => (
            <TabsTrigger key={c.key} value={c.key}>{c.label}</TabsTrigger>
          ))}
          <TabsTrigger value="audio">Audio</TabsTrigger>
        </TabsList>

        {/* Audio tab */}
        <TabsContent value="audio" className="space-y-4">
          <AudioTab tenantId={tenantId} />
        </TabsContent>

        {CATEGORIES.map(c => (
          <TabsContent key={c.key} value={c.key} className="space-y-4">

            {needsSubId && (
              <div className="space-y-2">
                {availableSubIds.length > 0 && (
                  <div className="flex gap-2 flex-wrap items-center">
                    <span className="text-xs text-muted-foreground">Select:</span>
                    {availableSubIds.map(id => (
                      <Button
                        key={id}
                        size="sm"
                        variant={subId === id ? 'default' : 'outline'}
                        type="button"
                        onClick={() => setSubId(id)}
                      >
                        {id}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <div className="space-y-1 flex-1 max-w-xs">
                    <Label>ID (for upload or new entry)</Label>
                    <Input
                      placeholder={activeTab === 'sprites/enemies' ? 'e.g. guard, boss' : 'e.g. pistol, rifle'}
                      value={subId}
                      onChange={e => setSubId(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            <AssetUploader
              tenantId={tenantId}
              category={c.key}
              subId={subId || undefined}
              onDone={() => { refetch(); invalidate(); setImgBuster(Date.now()); }}
            />

            {files.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">
                  {subId ? `${subId} — ` : ''}{files.length} file{files.length !== 1 ? 's' : ''}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {files.map(filename => (
                    <div key={filename} className="border rounded-md overflow-hidden group">
                      <div className="relative">
                        <img
                          src={`/assets/${tenantId}/assets/${c.key}${subId ? `/${subId}` : ''}/${filename}${imgBuster ? `?t=${imgBuster}` : ''}`}
                          alt={filename}
                          className="w-full aspect-square object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                          <Button
                            size="sm" variant="secondary"
                            title="Replace with new image"
                            disabled={replacing === filename || resetting === filename}
                            onClick={() => handleReplaceClick(filename)}
                          >
                            {replacing === filename
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Upload className="h-3 w-3" />}
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            title="Reset to default"
                            disabled={resetting === filename || replacing === filename}
                            onClick={() => handleResetToDefault(filename)}
                          >
                            {resetting === filename
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <RotateCcw className="h-3 w-3" />}
                          </Button>
                          <Button
                            size="sm" variant="destructive"
                            onClick={() => handleDelete(filename)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="px-1 py-1 bg-muted/50 border-t">
                        <p className="text-xs font-medium text-center truncate leading-tight">
                          {labelForFile(c.key, filename)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {needsSubId && !subId && availableSubIds.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No {activeTab === 'sprites/enemies' ? 'enemies' : 'weapons'} uploaded yet.
                Enter an ID above to upload sprites.
              </p>
            )}

          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
