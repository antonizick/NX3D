import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Trash2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Input }  from '@/components/ui/input.tsx';
import { Label }  from '@/components/ui/label.tsx';
import { Badge }  from '@/components/ui/badge.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog.tsx';
import { Card, CardContent } from '@/components/ui/card.tsx';
import { usersApi } from '@/lib/api.ts';
import { useAuth } from '@/hooks/useAuth.ts';

const schema = z.object({
  username: z.string().min(2).max(40),
  password: z.string().min(8),
  role:     z.enum(['builder', 'player']),
});
type Form = z.infer<typeof schema>;

export function Users() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const tenantId = user?.tenantId ?? '';
  const [open, setOpen] = useState(false);

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'player' },
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', tenantId],
    queryFn:  () => usersApi.list(tenantId),
    enabled:  !!tenantId,
  });

  const createMut = useMutation({
    mutationFn: (data: Form) => usersApi.create(tenantId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', tenantId] });
      toast.success('User created');
      form.reset();
      setOpen(false);
    },
    onError: (e: unknown) => toast.error((e as Error).message ?? 'Failed to create user'),
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => usersApi.delete(tenantId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', tenantId] });
      toast.success('User deleted');
    },
    onError: () => toast.error('Delete failed'),
  });

  const onSubmit = form.handleSubmit(data => createMut.mutate(data));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">Manage builders and players</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label>Username</Label>
                <Input {...form.register('username')} />
                {form.formState.errors.username && (
                  <p className="text-xs text-destructive">{form.formState.errors.username.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input type="password" {...form.register('password')} />
                {form.formState.errors.password && (
                  <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select
                  value={form.watch('role')}
                  onValueChange={v => form.setValue('role', v as 'builder' | 'player')}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="player">Player</SelectItem>
                    <SelectItem value="builder">Builder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create User'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2">
          {users.map((u: { id: string; username: string; role: string; totpEnabled: boolean; lastLogin?: string; createdAt: string }) => (
            <Card key={u.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <Shield className={`h-5 w-5 shrink-0 ${u.role === 'builder' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{u.username}</p>
                  <p className="text-xs text-muted-foreground">
                    Last login: {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={u.role === 'builder' ? 'default' : 'secondary'}>{u.role}</Badge>
                  {u.totpEnabled && <Badge variant="outline">MFA</Badge>}
                  <Button
                    size="icon" variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete user "${u.username}"?`)) deleteMut.mutate(u.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
