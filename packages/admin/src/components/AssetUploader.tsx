import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { assetsApi } from '@/lib/api.ts';

// Mirror of server's AssetCategory union — keep in sync with server/src/services/assetService.ts
type AssetCategory =
  | 'textures'
  | 'sprites/enemies'
  | 'sprites/weapons'
  | 'sprites/items'
  | 'sprites/player_portraits'
  | 'sprites/projectiles';

interface Props {
  tenantId: string;
  category: AssetCategory | string;
  subId?: string;
  accept?: string;
  onDone?: () => void;
}

interface FileState {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  preview?: string;
  error?: string;
}

export function AssetUploader({ tenantId, category, subId, accept = 'image/*', onDone }: Props) {
  const [files, setFiles] = useState<FileState[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: File[]) => {
    const newStates: FileState[] = incoming.map(file => ({
      file,
      status: 'pending',
      progress: 0,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));
    setFiles(prev => [...prev, ...newStates]);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
  };

  const remove = (idx: number) => {
    setFiles(prev => {
      const f = prev[idx];
      if (f?.preview) URL.revokeObjectURL(f.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const uploadAll = async () => {
    const pending = files.filter(f => f.status === 'pending');
    if (!pending.length) return;

    for (let i = 0; i < files.length; i++) {
      if (files[i]!.status !== 'pending') continue;

      setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f));
      try {
        await assetsApi.upload(
          tenantId, category as AssetCategory,
          [files[i]!.file], subId,
          (pct) => setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, progress: pct } : f))
        );
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done', progress: 100 } : f));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', error: msg } : f));
        toast.error(`Failed: ${files[i]!.file.name}`);
      }
    }
    toast.success('Upload complete');
    onDone?.();
  };

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          Drop files here or <span className="text-primary underline">browse</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">PNG, JPEG, WebP — max 8 MB each</p>
        <input ref={inputRef} type="file" multiple accept={accept} className="hidden" onChange={onInputChange} />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 p-2 border rounded-md bg-card">
              {f.preview && (
                <img src={f.preview} alt="" className="h-10 w-10 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{f.file.name}</p>
                {f.status === 'uploading' && (
                  <div className="h-1 bg-muted rounded mt-1">
                    <div className="h-1 bg-primary rounded" style={{ width: `${f.progress}%` }} />
                  </div>
                )}
                {f.status === 'error' && (
                  <p className="text-xs text-destructive">{f.error}</p>
                )}
              </div>
              {f.status === 'done' ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => remove(i)}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}

          <Button onClick={uploadAll} className="w-full" disabled={files.every(f => f.status !== 'pending')}>
            Upload {files.filter(f => f.status === 'pending').length} file(s)
          </Button>
        </div>
      )}
    </div>
  );
}
