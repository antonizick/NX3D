import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Wand2, RefreshCw, Eye, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog.tsx';
import { levelsApi, tenantsApi } from '@/lib/api.ts';
import { useTenant } from '@/contexts/TenantContext.tsx';

export function Levels() {
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const [difficulty, setDifficulty] = useState('normal');
  const [levelsPerEpisode, setLevelsPerEpisode] = useState(9);
  const [previewLevel, setPreviewLevel] = useState<null | Record<string, unknown>>(null);

  // Level message edit state
  const [editLevelOpen, setEditLevelOpen] = useState(false);
  const [editingLevelId, setEditingLevelId] = useState<number | null>(null);
  const [levelOnLoad, setLevelOnLoad] = useState('');
  const [levelOnExit, setLevelOnExit] = useState('');

  const { data: tenant } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn:  () => tenantsApi.get(tenantId),
    enabled:  !!tenantId,
  });

  useEffect(() => {
    if (tenant?.game?.levelsPerEpisode) setLevelsPerEpisode(tenant.game.levelsPerEpisode);
  }, [tenant?.game?.levelsPerEpisode]);

  const updateLevelsMut = useMutation({
    mutationFn: (n: number) =>
      tenantsApi.update(tenantId, { game: { ...tenant?.game, levelsPerEpisode: n } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      toast.success('Level count saved');
    },
    onError: () => toast.error('Failed to save level count'),
  });

  const { data: levelsData, refetch } = useQuery({
    queryKey: ['levels', tenantId],
    queryFn:  () => levelsApi.list(tenantId),
    enabled:  !!tenantId,
  });

  const generateAll = useMutation({
    mutationFn: () => levelsApi.generateAll(tenantId, difficulty),
    onSuccess: (data) => {
      toast.success(`Generated ${data.generated?.length ?? 0} levels`);
      refetch();
    },
    onError: () => toast.error('Generation failed'),
  });

  const deleteAllMut = useMutation({
    mutationFn: () => levelsApi.deleteAll(tenantId),
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} level${data.deleted !== 1 ? 's' : ''}`);
      setPreviewLevel(null);
      refetch();
    },
    onError: () => toast.error('Delete failed'),
  });

  const regenMut = useMutation({
    mutationFn: ({ levelId }: { levelId: number }) =>
      levelsApi.regenerate(tenantId, levelId, { difficulty }),
    onSuccess: () => {
      toast.success('Level regenerated');
      refetch();
    },
    onError: () => toast.error('Regeneration failed'),
  });

  const saveLevelMsgMut = useMutation({
    mutationFn: ({ levelId, onLoadMessage, onExitMessage }: { levelId: number; onLoadMessage: string; onExitMessage: string }) =>
      levelsApi.updateMessages(tenantId, levelId, { onLoadMessage, onExitMessage }),
    onSuccess: () => {
      toast.success('Level messages saved');
      setEditLevelOpen(false);
      setEditingLevelId(null);
    },
    onError: () => toast.error('Failed to save level messages'),
  });

  async function openEditLevel(levelId: number) {
    setEditingLevelId(levelId);
    setLevelOnLoad('');
    setLevelOnExit('');
    setEditLevelOpen(true);
    try {
      const data = await levelsApi.get(tenantId, levelId);
      setLevelOnLoad(data.onLoadMessage ?? '');
      setLevelOnExit(data.onExitMessage ?? '');
    } catch {
      toast.error('Failed to load level data');
      setEditLevelOpen(false);
    }
  }

  const levels: string[] = levelsData?.levels ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Levels</h1>
        <p className="text-muted-foreground">Generate and manage game levels</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Build the World</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <p className="text-sm font-medium">Difficulty</p>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">Levels per episode</p>
            <Select
              value={String(levelsPerEpisode)}
              onValueChange={v => {
                const n = parseInt(v, 10);
                setLevelsPerEpisode(n);
                updateLevelsMut.mutate(n);
              }}
              disabled={updateLevelsMut.isPending}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 9 }, (_, i) => i + 2).map(n => (
                  <SelectItem key={n} value={String(n)}>{n} levels</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => generateAll.mutate()}
            disabled={generateAll.isPending}
            className="gap-2"
          >
            <Wand2 className="h-4 w-4" />
            {generateAll.isPending
              ? 'Generating…'
              : `Build World (${(tenant?.game?.episodes ?? 1) * (tenant?.game?.levelsPerEpisode ?? 9)} levels)`}
          </Button>
        </CardContent>
      </Card>

      {levels.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Generated Levels ({levels.length})</h2>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              disabled={deleteAllMut.isPending}
              onClick={() => {
                if (confirm(`Delete all ${levels.length} level${levels.length !== 1 ? 's' : ''}? This cannot be undone.`)) {
                  deleteAllMut.mutate();
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              {deleteAllMut.isPending ? 'Deleting…' : 'Delete All Levels'}
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
            {levels.map(filename => {
              const levelId = parseInt(filename.replace('level_', '').replace('.json', ''), 10);
              return (
                <Card key={filename}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Level {levelId}</p>
                      <p className="text-xs text-muted-foreground">{filename}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7"
                        title="Edit level messages"
                        onClick={() => openEditLevel(levelId)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7"
                        title="Preview level map"
                        onClick={async () => {
                          const data = await levelsApi.get(tenantId, levelId);
                          setPreviewLevel(data);
                        }}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7"
                        title="Regenerate level"
                        onClick={() => regenMut.mutate({ levelId })}
                        disabled={regenMut.isPending}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Mini-map preview */}
      {previewLevel && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Level Preview</CardTitle>
              <Badge variant={((previewLevel as { hasBoss?: boolean }).hasBoss) ? 'destructive' : 'secondary'}>
                {(previewLevel as { hasBoss?: boolean }).hasBoss ? 'Boss Level' : 'Standard'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <MiniMap level={previewLevel as { grid: number[][] }} />
            <p className="text-xs text-muted-foreground mt-2">
              Par time: {(previewLevel as { parTime?: number }).parTime}s ·{' '}
              Entities: {((previewLevel as { entities?: unknown[] }).entities ?? []).length}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Level message edit dialog */}
      <Dialog open={editLevelOpen} onOpenChange={open => { if (!open) { setEditLevelOpen(false); setEditingLevelId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Level {editingLevelId} — Messages</DialogTitle>
            <DialogDescription>
              Pop-up text shown when the player enters or exits this level. Leave blank for no message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-1.5">
              <Label>On Level Load</Label>
              <textarea
                value={levelOnLoad}
                onChange={e => setLevelOnLoad(e.target.value)}
                placeholder="Message shown when the player first enters this level…"
                rows={5}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>On Level Exit</Label>
              <textarea
                value={levelOnExit}
                onChange={e => setLevelOnExit(e.target.value)}
                placeholder="Message shown when the player reaches the exit…"
                rows={5}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (editingLevelId !== null) {
                  saveLevelMsgMut.mutate({ levelId: editingLevelId, onLoadMessage: levelOnLoad, onExitMessage: levelOnExit });
                }
              }}
              disabled={saveLevelMsgMut.isPending}
            >
              {saveLevelMsgMut.isPending ? 'Saving…' : 'Save Messages'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniMap({ level }: { level: { grid: number[][] } }) {
  const grid = level.grid ?? [];
  const size = 4; // pixels per cell
  const w = 64; const h = 64;

  return (
    <canvas
      width={w * size}
      height={h * size}
      className="border rounded"
      ref={canvas => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const cell = grid[y]?.[x] ?? 0;
            ctx.fillStyle = cell > 0 ? '#555' : '#1a1a2e';
            ctx.fillRect(x * size, y * size, size, size);
          }
        }
      }}
    />
  );
}
