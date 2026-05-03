import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, ExternalLink, Pencil, Upload, X, Copy, Info, Package, Download } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card.tsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogDescription,
} from '@/components/ui/dialog.tsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs.tsx';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover.tsx';
import { tenantsApi, deployApi } from '@/lib/api.ts';

// ─── Local type mirrors (server types not importable across packages) ─────────

interface TenantRow {
  tenantId: string;
  name: string;
  logoUrl?: string;
  createdAt: string;
  game: { title: string; episodes: number; levelsPerEpisode: number };
}

interface ThemeEdit {
  primaryColor: string;
  accentColor: string;
  hudColor: string;
  skyColor: string;
  floorColor: string;
}

interface GameSettingsEdit {
  title: string;
  episodes: number;
  levelsPerEpisode: number;
  startingLives: number;
  maxHealth: number;
  maxAmmo: Record<string, number>;
  weaponRange: number;
}

interface EnemyEdit {
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
  sprites: unknown;
  sounds: unknown;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldHelp({ title, text }: { title: string; text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex-shrink-0"
          aria-label={`Help: ${title}`}
        >
          <Info className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" className="w-72">
        <p className="font-semibold text-sm mb-1 text-zinc-100">{title}</p>
        <p className="text-sm text-zinc-300 leading-relaxed">{text}</p>
      </PopoverContent>
    </Popover>
  );
}

function ColorField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help: string;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center">
        <Label className="text-sm">{label}</Label>
        <FieldHelp title={label} text={help} />
      </div>
      <div className="flex items-center gap-3">
        <div
          className="relative h-10 w-10 rounded-md border border-input overflow-hidden flex-shrink-0 cursor-pointer"
          style={{ backgroundColor: safe }}
          title="Click swatch to open picker"
        >
          <input
            type="color"
            value={safe}
            onChange={e => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </div>
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="#rrggbb"
          className="font-mono w-28 text-sm"
          maxLength={7}
        />
        <div
          className="h-10 flex-1 rounded-md border border-input"
          style={{ backgroundColor: safe }}
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  help: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center">
        <Label className="text-sm">{label}</Label>
        <FieldHelp title={label} text={help} />
      </div>
      <div className="flex items-center gap-3">
        <Input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-24 text-sm"
        />
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-primary h-2"
        />
        {unit && <span className="text-xs text-muted-foreground w-14 text-right">{unit}</span>}
      </div>
    </div>
  );
}

function EnemyEditor({
  enemy,
  onChange,
}: {
  enemy: EnemyEdit;
  onChange: (patch: Partial<EnemyEdit>) => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm">{enemy.name}</span>
        <span className="text-xs text-muted-foreground font-mono">({enemy.id})</span>
        {enemy.isBoss && <Badge variant="destructive" className="text-xs">Boss</Badge>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumberField
          label="Hit Points"
          value={enemy.hp}
          onChange={v => onChange({ hp: v })}
          min={1} max={9999}
          help="Total damage the player must deal to kill this enemy. Higher values make enemies feel tankier — bosses are typically 10× a normal guard. Default: 25"
        />
        <NumberField
          label="Move Speed"
          value={enemy.speed}
          onChange={v => onChange({ speed: v })}
          min={0.1} max={10} step={0.1}
          unit="tiles/s"
          help="How many tiles per second the enemy moves toward the player. 1.5 is a brisk walk; values above 4 feel dangerously fast in narrow corridors. Default: 1.5"
        />
        <NumberField
          label="Attack Damage"
          value={enemy.attackDamage}
          onChange={v => onChange({ attackDamage: v })}
          min={1} max={999}
          unit="HP / hit"
          help="Damage dealt to the player each time this enemy lands an attack. Combined with Attack Cooldown this sets the enemy's effective DPS. Default: 8"
        />
        <NumberField
          label="Attack Range"
          value={enemy.attackRange}
          onChange={v => onChange({ attackRange: v })}
          min={0.5} max={20} step={0.5}
          unit="tiles"
          help="How close the player must be (in tiles) for this enemy to trigger a melee attack. 2 is roughly arm's-reach; set higher for ranged enemies. Default: 2"
        />
        <NumberField
          label="Attack Cooldown"
          value={enemy.attackCooldown}
          onChange={v => onChange({ attackCooldown: v })}
          min={100} max={10000} step={50}
          unit="ms"
          help="Minimum milliseconds between attacks. 1500 ms = one hit per 1.5 seconds. Lower values create a more relentless enemy. Default: 1500 ms"
        />
        <NumberField
          label="Sight Range"
          value={enemy.sightRange}
          onChange={v => onChange({ sightRange: v })}
          min={1} max={64}
          unit="tiles"
          help="Line-of-sight distance in tiles at which this enemy spots and starts chasing the player. Guards beyond this distance remain passive. Default: 12 tiles"
        />
        <NumberField
          label="Score Value"
          value={enemy.score}
          onChange={v => onChange({ score: v })}
          min={0} max={99999} step={50}
          unit="pts"
          help="Points awarded to the player for killing this enemy. Shown on the end-of-level stats screen. Default: 100"
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const DEFAULT_THEME: ThemeEdit = {
  primaryColor: '#c8a000',
  accentColor: '#8b0000',
  hudColor: '#3a3a3a',
  skyColor: '#383838',
  floorColor: '#707070',
};

export function Tenants() {
  const qc = useQueryClient();

  // ── Create state ───────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // ── Edit dialog state ──────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Config edit state (populated from full config fetch) ───────────────────
  const [themeEdit, setThemeEdit] = useState<ThemeEdit>({ ...DEFAULT_THEME });
  const [gameEdit, setGameEdit] = useState<GameSettingsEdit>({
    title: '', episodes: 1, levelsPerEpisode: 9,
    startingLives: 3, maxHealth: 100, maxAmmo: { bullets: 99 }, weaponRange: 0,
  });
  const [enemiesEdit, setEnemiesEdit] = useState<EnemyEdit[]>([]);
  const [narrativeEdit, setNarrativeEdit] = useState('');

  // ── Deploy state ───────────────────────────────────────────────────────────
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployingTenant, setDeployingTenant] = useState<TenantRow | null>(null);

  // ── Clone state ────────────────────────────────────────────────────────────
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloningTenant, setCloningTenant] = useState<TenantRow | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloneLogoFile, setCloneLogoFile] = useState<File | null>(null);
  const [cloneLogoPreview, setCloneLogoPreview] = useState<string | null>(null);
  const cloneFileInputRef = useRef<HTMLInputElement>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: tenantsApi.list,
  });

  const { data: fullConfig, isLoading: configLoading } = useQuery({
    queryKey: ['tenants', editingTenant?.tenantId, 'full'],
    queryFn: () => tenantsApi.get(editingTenant!.tenantId),
    enabled: !!editingTenant && editOpen,
  });

  // Sync fetched config into local edit state
  useEffect(() => {
    if (!fullConfig) return;
    setThemeEdit({ ...DEFAULT_THEME, ...fullConfig.theme });
    setGameEdit({
      title: fullConfig.game?.title ?? '',
      episodes: fullConfig.game?.episodes ?? 1,
      levelsPerEpisode: fullConfig.game?.levelsPerEpisode ?? 9,
      startingLives: fullConfig.game?.startingLives ?? 3,
      maxHealth: fullConfig.game?.maxHealth ?? 100,
      maxAmmo: { ...(fullConfig.game?.maxAmmo ?? { bullets: 99 }) },
      weaponRange: fullConfig.game?.weaponRange ?? 0,
    });
    setEnemiesEdit((fullConfig.enemies ?? []).map((e: EnemyEdit) => ({ ...e })));
    setNarrativeEdit(fullConfig.narrative ?? '');
  }, [fullConfig]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: () => tenantsApi.create(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Tenant created');
      setName('');
      setCreateOpen(false);
    },
    onError: () => toast.error('Failed to create tenant'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => tenantsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Tenant deleted');
    },
    onError: () => toast.error('Failed to delete tenant'),
  });

  const saveTitleMut = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      tenantsApi.update(id, { name: title, game: { ...editingTenant?.game, title } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Game name saved');
    },
    onError: () => toast.error('Failed to save name'),
  });

  const uploadLogoMut = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => tenantsApi.uploadLogo(id, file),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      setLogoFile(null);
      setLogoPreview(data.logoUrl ? `${data.logoUrl}?t=${Date.now()}` : null);
      if (editingTenant) setEditingTenant(t => t ? { ...t, logoUrl: data.logoUrl } : t);
      toast.success('Logo uploaded');
    },
    onError: () => toast.error('Logo upload failed'),
  });

  const deleteLogoMut = useMutation({
    mutationFn: (id: string) => tenantsApi.deleteLogo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      setLogoPreview(null);
      setLogoFile(null);
      if (editingTenant) setEditingTenant(t => t ? { ...t, logoUrl: undefined } : t);
      toast.success('Logo removed');
    },
    onError: () => toast.error('Failed to remove logo'),
  });

  const saveThemeMut = useMutation({
    mutationFn: (id: string) => tenantsApi.update(id, { theme: themeEdit }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants', editingTenant?.tenantId, 'full'] });
      toast.success('Theme saved');
    },
    onError: () => toast.error('Failed to save theme'),
  });

  const saveGameMut = useMutation({
    mutationFn: (id: string) =>
      tenantsApi.update(id, {
        game: {
          title: gameEdit.title,
          episodes: gameEdit.episodes,
          levelsPerEpisode: gameEdit.levelsPerEpisode,
          startingLives: gameEdit.startingLives,
          maxHealth: gameEdit.maxHealth,
          maxAmmo: gameEdit.maxAmmo,
          weaponRange: gameEdit.weaponRange,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenants', editingTenant?.tenantId, 'full'] });
      toast.success('Game settings saved');
    },
    onError: () => toast.error('Failed to save game settings'),
  });

  const saveEnemiesMut = useMutation({
    mutationFn: (id: string) => tenantsApi.update(id, { enemies: enemiesEdit }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants', editingTenant?.tenantId, 'full'] });
      toast.success('Enemy config saved');
    },
    onError: () => toast.error('Failed to save enemies'),
  });

  const saveNarrativeMut = useMutation({
    mutationFn: (id: string) => tenantsApi.update(id, { narrative: narrativeEdit }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants', editingTenant?.tenantId, 'full'] });
      toast.success('Narrative saved');
    },
    onError: () => toast.error('Failed to save narrative'),
  });

  const { data: deployInfo, refetch: refetchDeploy } = useQuery({
    queryKey: ['deploy', deployingTenant?.tenantId],
    queryFn: () => deployApi.status(deployingTenant!.tenantId),
    enabled: !!deployingTenant && deployOpen,
    retry: false,
  });

  const buildMut = useMutation({
    mutationFn: () => deployApi.build(deployingTenant!.tenantId),
    onSuccess: () => {
      refetchDeploy();
      toast.success('Package built — ready to download');
    },
    onError: () => toast.error('Build failed — check server logs'),
  });

  const cloneMut = useMutation({
    mutationFn: async () => {
      const cloned = await tenantsApi.clone(cloningTenant!.tenantId, cloneName.trim());
      if (cloneLogoFile) await tenantsApi.uploadLogo(cloned.tenantId, cloneLogoFile);
      return cloned;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Tenant cloned');
      setCloneOpen(false);
      setCloningTenant(null);
      setCloneName('');
      setCloneLogoFile(null);
      setCloneLogoPreview(null);
    },
    onError: () => toast.error('Failed to clone tenant'),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function openEdit(t: TenantRow) {
    setEditingTenant(t);
    setTitleInput(t.game?.title ?? t.name);
    setLogoPreview(t.logoUrl ? `${t.logoUrl}?t=${Date.now()}` : null);
    setLogoFile(null);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditingTenant(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function openDeploy(t: TenantRow) {
    setDeployingTenant(t);
    setDeployOpen(true);
  }

  function openClone(t: TenantRow) {
    setCloningTenant(t);
    setCloneName(`${t.game?.title ?? t.name} (Copy)`);
    setCloneLogoFile(null);
    setCloneLogoPreview(null);
    setCloneOpen(true);
  }

  function handleCloneFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCloneLogoFile(file);
    setCloneLogoPreview(URL.createObjectURL(file));
  }

  function updateEnemy(index: number, patch: Partial<EnemyEdit>) {
    setEnemiesEdit(prev => prev.map((e, i) => i === index ? { ...e, ...patch } : e));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tenants</h1>
          <p className="text-muted-foreground">Manage game worlds</p>
        </div>

        {/* ── Create dialog ─────────────────────────────────────────────────── */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> New Tenant</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Tenant</DialogTitle>
              <DialogDescription>A new game world with default assets</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label>Tenant Name</Label>
                <Input
                  placeholder="My Wolfenstein World"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createMut.mutate()}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => createMut.mutate()}
                disabled={!name.trim() || createMut.isPending}
              >
                {createMut.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Tenant grid ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : tenants.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No tenants yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(tenants as TenantRow[]).map(t => (
            <Card key={t.tenantId}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {t.logoUrl && (
                      <img
                        src={`${t.logoUrl}?t=${t.createdAt}`}
                        alt="logo"
                        className="h-10 w-10 rounded object-contain flex-shrink-0 bg-muted"
                      />
                    )}
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{t.game?.title ?? t.name}</CardTitle>
                      <CardDescription className="font-mono text-xs mt-1 truncate">{t.tenantId}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="flex-shrink-0 ml-2">{t.game?.episodes ?? 1} ep</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  {t.game?.levelsPerEpisode ?? 9} levels/ep ·{' '}
                  Created {new Date(t.createdAt).toLocaleDateString()}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild className="flex-1">
                    <a href={`http://localhost:5174/game/${t.tenantId}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3 w-3" /> Play
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    title="Clone tenant"
                    onClick={() => openClone(t)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    title="Deploy game"
                    onClick={() => openDeploy(t)}
                  >
                    <Package className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="destructive" size="sm"
                    onClick={() => {
                      if (confirm(`Delete tenant "${t.name}"? This cannot be undone.`)) {
                        deleteMut.mutate(t.tenantId);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Edit dialog (controlled, shared) ─────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={o => { if (!o) closeEdit(); }}>
        <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>
              {editingTenant?.game?.title ?? editingTenant?.name}
            </DialogDescription>
          </DialogHeader>

          {editingTenant && (
            <Tabs defaultValue="basic" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="mx-6 mt-4 mb-2 flex-shrink-0 w-fit">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="theme">Theme</TabsTrigger>
                <TabsTrigger value="game">Game</TabsTrigger>
                <TabsTrigger value="enemies">Enemies</TabsTrigger>
                <TabsTrigger value="narrative">Narrative</TabsTrigger>
              </TabsList>

              {/* ── Basic tab ──────────────────────────────────────────── */}
              <TabsContent value="basic" className="flex-1 overflow-y-auto px-6 pb-6 space-y-5 mt-0">
                <div className="space-y-1.5 pt-2">
                  <Label>Game Name</Label>
                  <div className="flex gap-2">
                    <Input
                      value={titleInput}
                      onChange={e => setTitleInput(e.target.value)}
                      placeholder="Enter game name…"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && titleInput.trim()) {
                          saveTitleMut.mutate({ id: editingTenant.tenantId, title: titleInput.trim() });
                        }
                      }}
                    />
                    <Button
                      onClick={() => saveTitleMut.mutate({ id: editingTenant.tenantId, title: titleInput.trim() })}
                      disabled={!titleInput.trim() || saveTitleMut.isPending}
                    >
                      {saveTitleMut.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Shown on main menu and loading screens</p>
                </div>

                <div className="space-y-2">
                  <Label>Game Logo</Label>
                  {logoPreview ? (
                    <div className="flex items-start gap-3">
                      <img
                        src={logoPreview}
                        alt="logo preview"
                        className="h-24 w-24 rounded-lg object-contain bg-muted border"
                      />
                      <div className="space-y-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="h-3 w-3 mr-1" /> Change
                        </Button>
                        {logoFile ? (
                          <Button
                            size="sm"
                            onClick={() => uploadLogoMut.mutate({ id: editingTenant.tenantId, file: logoFile })}
                            disabled={uploadLogoMut.isPending}
                          >
                            {uploadLogoMut.isPending ? 'Uploading…' : 'Upload'}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteLogoMut.mutate(editingTenant.tenantId)}
                            disabled={deleteLogoMut.isPending}
                          >
                            <X className="h-3 w-3 mr-1" />
                            {deleteLogoMut.isPending ? 'Removing…' : 'Remove'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click to upload logo</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPEG or WebP · max 512×512 output</p>
                      {logoFile && (
                        <Button
                          className="mt-3"
                          size="sm"
                          onClick={e => {
                            e.stopPropagation();
                            uploadLogoMut.mutate({ id: editingTenant.tenantId, file: logoFile });
                          }}
                          disabled={uploadLogoMut.isPending}
                        >
                          {uploadLogoMut.isPending ? 'Uploading…' : 'Upload Logo'}
                        </Button>
                      )}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <p className="text-xs text-muted-foreground">Displayed above the game title on menu and loading screens</p>
                </div>
              </TabsContent>

              {/* ── Theme tab ──────────────────────────────────────────── */}
              <TabsContent value="theme" className="flex-1 overflow-y-auto px-6 pb-6 mt-0">
                {configLoading ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">Loading config…</p>
                ) : (
                  <div className="space-y-5 pt-2">
                    <p className="text-xs text-muted-foreground">
                      Colors used across menus, HUD, and the 3D view. Click a swatch or edit the hex value.
                    </p>
                    <ColorField
                      label="Primary Color"
                      value={themeEdit.primaryColor}
                      onChange={v => setThemeEdit(t => ({ ...t, primaryColor: v }))}
                      help="Main accent color for menus, HUD borders, and highlighted text. Seen most prominently on the main menu title and selected items. Default: #c8a000"
                    />
                    <ColorField
                      label="Accent Color"
                      value={themeEdit.accentColor}
                      onChange={v => setThemeEdit(t => ({ ...t, accentColor: v }))}
                      help="Used for health bar fills, danger indicators, and boss encounter alerts. Typically a dark red that creates urgency against the HUD background. Default: #8b0000"
                    />
                    <ColorField
                      label="HUD Color"
                      value={themeEdit.hudColor}
                      onChange={v => setThemeEdit(t => ({ ...t, hudColor: v }))}
                      help="Background fill of the heads-up display strip at the bottom of the screen — the panel that shows health, ammo, face portrait, and score. Default: #3a3a3a"
                    />
                    <ColorField
                      label="Sky Color"
                      value={themeEdit.skyColor}
                      onChange={v => setThemeEdit(t => ({ ...t, skyColor: v }))}
                      help="Solid fill rendered in the top half of the 3D view (above the horizon line). This is the 'ceiling sky' that players see when no ceiling texture is assigned. Darker values feel more dungeon-like. Default: #383838"
                    />
                    <ColorField
                      label="Floor Color"
                      value={themeEdit.floorColor}
                      onChange={v => setThemeEdit(t => ({ ...t, floorColor: v }))}
                      help="Solid fill rendered in the bottom half of the 3D view (below the horizon line). Visible between wall bases when the camera tilts slightly. Lighter values feel more open. Default: #707070"
                    />
                    <Button
                      onClick={() => saveThemeMut.mutate(editingTenant.tenantId)}
                      disabled={saveThemeMut.isPending}
                    >
                      {saveThemeMut.isPending ? 'Saving…' : 'Save Theme'}
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* ── Game tab ───────────────────────────────────────────── */}
              <TabsContent value="game" className="flex-1 overflow-y-auto px-6 pb-6 mt-0">
                {configLoading ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">Loading config…</p>
                ) : (
                  <div className="space-y-5 pt-2">
                    <p className="text-xs text-muted-foreground">
                      Core gameplay rules applied at the start of every new game session.
                    </p>
                    <NumberField
                      label="Starting Lives"
                      value={gameEdit.startingLives}
                      onChange={v => setGameEdit(g => ({ ...g, startingLives: v }))}
                      min={1} max={9}
                      unit="lives"
                      help="Number of extra lives the player starts with at the beginning of a new game. Reaching zero ends the game. Typical values are 1–5; classic Wolf3D uses 3. Default: 3"
                    />
                    <NumberField
                      label="Max Health"
                      value={gameEdit.maxHealth}
                      onChange={v => setGameEdit(g => ({ ...g, maxHealth: v }))}
                      min={1} max={999}
                      unit="HP"
                      help="The maximum HP the player can ever have. Health pickups cannot push the player above this cap. Classic Wolf3D caps at 100; raising it makes the game more forgiving. Default: 100"
                    />
                    <NumberField
                      label="User Range"
                      value={gameEdit.weaponRange}
                      onChange={v => setGameEdit(g => ({ ...g, weaponRange: v }))}
                      min={0} max={64} step={1}
                      unit="tiles"
                      help="Maximum distance in tiles the player's weapons can deal damage. Set to 0 for unlimited range. Limiting range (e.g. 15 tiles) prevents one-shotting enemies across large rooms. Default: 0 (unlimited)"
                    />
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <Label className="text-sm">Max Ammo</Label>
                        <FieldHelp
                          title="Max Ammo"
                          text="Maximum ammo the player can carry per type. Ammo pickups beyond the cap are wasted. Each key corresponds to an ammoType defined on weapons and ammo items. Defaults: bullets 99, shells 50"
                        />
                      </div>
                      {Object.entries(gameEdit.maxAmmo).map(([ammoType, cap]) => (
                        <div key={ammoType} className="flex items-center gap-3 pl-4 border-l-2 border-muted">
                          <span className="text-sm font-mono w-20 text-muted-foreground">{ammoType}</span>
                          <Input
                            type="number"
                            value={cap}
                            min={1} max={9999}
                            onChange={e => {
                              const n = parseInt(e.target.value);
                              if (!isNaN(n) && n >= 1) {
                                setGameEdit(g => ({
                                  ...g,
                                  maxAmmo: { ...g.maxAmmo, [ammoType]: n },
                                }));
                              }
                            }}
                            className="w-24 text-sm"
                          />
                          <input
                            type="range"
                            value={cap}
                            min={1} max={999}
                            onChange={e => setGameEdit(g => ({
                              ...g,
                              maxAmmo: { ...g.maxAmmo, [ammoType]: parseInt(e.target.value) },
                            }))}
                            className="flex-1 accent-primary h-2"
                          />
                          <span className="text-xs text-muted-foreground w-14 text-right">{cap} max</span>
                        </div>
                      ))}
                    </div>
                    <Button
                      onClick={() => saveGameMut.mutate(editingTenant.tenantId)}
                      disabled={saveGameMut.isPending}
                    >
                      {saveGameMut.isPending ? 'Saving…' : 'Save Game Settings'}
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* ── Enemies tab ────────────────────────────────────────── */}
              <TabsContent value="enemies" className="flex-1 overflow-y-auto px-6 pb-6 mt-0">
                {configLoading ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">Loading config…</p>
                ) : (
                  <div className="space-y-4 pt-2">
                    <p className="text-xs text-muted-foreground">
                      Tune each enemy's combat stats. Changes apply to all newly generated levels.
                    </p>
                    {enemiesEdit.length === 0 && (
                      <p className="text-sm text-muted-foreground py-4 text-center">No enemies configured.</p>
                    )}
                    {enemiesEdit.map((enemy, idx) => (
                      <EnemyEditor
                        key={enemy.id}
                        enemy={enemy}
                        onChange={patch => updateEnemy(idx, patch)}
                      />
                    ))}
                    {enemiesEdit.length > 0 && (
                      <Button
                        onClick={() => saveEnemiesMut.mutate(editingTenant.tenantId)}
                        disabled={saveEnemiesMut.isPending}
                      >
                        {saveEnemiesMut.isPending ? 'Saving…' : 'Save Enemy Config'}
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>
              {/* ── Narrative tab ───────────────────────────────────────── */}
              <TabsContent value="narrative" className="flex-1 overflow-y-auto px-6 pb-6 mt-0">
                {configLoading ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">Loading config…</p>
                ) : (
                  <div className="space-y-4 pt-2">
                    <p className="text-xs text-muted-foreground">
                      Story text shown on the main menu below the Exit Game option, displayed in gold. Leave blank to show no story.
                    </p>
                    <div className="space-y-1.5">
                      <Label>Narrative</Label>
                      <textarea
                        value={narrativeEdit}
                        onChange={e => setNarrativeEdit(e.target.value)}
                        placeholder="Enter your game's story or setting…"
                        rows={10}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono"
                      />
                    </div>
                    <Button
                      onClick={() => saveNarrativeMut.mutate(editingTenant.tenantId)}
                      disabled={saveNarrativeMut.isPending}
                    >
                      {saveNarrativeMut.isPending ? 'Saving…' : 'Save Narrative'}
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Deploy dialog ─────────────────────────────────────────────────── */}
      <Dialog open={deployOpen} onOpenChange={open => {
        if (!open) { setDeployOpen(false); setDeployingTenant(null); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deploy Game</DialogTitle>
            <DialogDescription>
              Build a self-contained installation package for{' '}
              <span className="font-medium text-foreground">
                {deployingTenant?.game?.title ?? deployingTenant?.name}
              </span>.
              The package can be installed on any Linux server with Node.js 22+.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Build button */}
            <Button
              className="w-full"
              onClick={() => buildMut.mutate()}
              disabled={buildMut.isPending}
            >
              <Package className="h-4 w-4 mr-2" />
              {buildMut.isPending
                ? 'Building package… (may take ~30–60 s)'
                : deployInfo ? 'Rebuild Package' : 'Build Package'}
            </Button>

            {buildMut.isPending && (
              <p className="text-xs text-muted-foreground text-center animate-pulse">
                Compiling game frontend and packaging assets…
              </p>
            )}

            {/* Download section — shown once a build exists */}
            {deployInfo && !buildMut.isPending && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <a
                  href={deployApi.downloadUrl(deployingTenant!.tenantId)}
                  download
                  className="flex items-center justify-center gap-2 w-full rounded-md bg-green-600 hover:bg-green-500 text-white font-semibold py-2.5 px-4 transition-colors text-sm"
                >
                  <Download className="h-4 w-4" />
                  Download {deployInfo.filename}
                </a>
                <div className="text-center space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    Built {new Date(deployInfo.builtAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(deployInfo.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="rounded-md bg-muted/50 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">On the target server</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Extract: <code className="font-mono bg-muted px-1 rounded">tar xzf {deployingTenant ? `${deployingTenant.game?.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'game'}-game.tar.gz` : '…'}</code></li>
                <li>Run: <code className="font-mono bg-muted px-1 rounded">bash install.sh</code></li>
                <li>Follow the prompts — port, auto-start, done.</li>
              </ol>
              <p className="text-xs text-muted-foreground pt-1">
                Requires Node.js 22+ and npm. No authentication needed to play.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Clone dialog (controlled, shared) ─────────────────────────────── */}
      <Dialog open={cloneOpen} onOpenChange={open => {
        if (!open) {
          setCloneOpen(false);
          setCloningTenant(null);
          setCloneName('');
          setCloneLogoFile(null);
          setCloneLogoPreview(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clone Tenant</DialogTitle>
            <DialogDescription>
              Copies all assets, levels, and config from{' '}
              <span className="font-medium text-foreground">{cloningTenant?.game?.title ?? cloningTenant?.name}</span>{' '}
              into a new independent tenant. Users and saves are not copied.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-1.5">
              <Label>New Game Name</Label>
              <Input
                value={cloneName}
                onChange={e => setCloneName(e.target.value)}
                placeholder="Enter new game name…"
                onKeyDown={e => {
                  if (e.key === 'Enter' && cloneName.trim() && !cloneMut.isPending) {
                    cloneMut.mutate();
                  }
                }}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>New Logo <span className="text-muted-foreground font-normal">(optional — leave blank to keep source logo)</span></Label>
              {cloneLogoPreview ? (
                <div className="flex items-start gap-3">
                  <img
                    src={cloneLogoPreview}
                    alt="logo preview"
                    className="h-20 w-20 rounded-lg object-contain bg-muted border"
                  />
                  <div className="space-y-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => cloneFileInputRef.current?.click()}>
                      <Upload className="h-3 w-3 mr-1" /> Change
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setCloneLogoFile(null); setCloneLogoPreview(null); }}
                    >
                      <X className="h-3 w-3 mr-1" /> Clear
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => cloneFileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Click to upload a different logo</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPEG or WebP</p>
                </div>
              )}
              <input
                ref={cloneFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleCloneFileChange}
              />
            </div>

            <Button
              className="w-full"
              onClick={() => cloneMut.mutate()}
              disabled={!cloneName.trim() || cloneMut.isPending}
            >
              <Copy className="h-4 w-4 mr-2" />
              {cloneMut.isPending ? 'Cloning…' : 'Clone Tenant'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
