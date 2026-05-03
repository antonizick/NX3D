import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Input }  from '@/components/ui/input.tsx';
import { Label }  from '@/components/ui/label.tsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card.tsx';
import { useAuth } from '@/hooks/useAuth.ts';
import api from '@/lib/api.ts';

const loginSchema = z.object({
  tenantId: z.string().min(1, 'Tenant ID required'),
  username: z.string().min(1, 'Username required'),
  password: z.string().min(1, 'Password required'),
});

const mfaSchema = z.object({ token: z.string().length(6, 'Must be 6 digits') });

type LoginForm = z.infer<typeof loginSchema>;
type MfaForm   = z.infer<typeof mfaSchema>;

interface TenantOption { tenantId: string; name: string; }

export function Login() {
  const { loginMut, mfaMut } = useAuth();
  const [mfaState, setMfaState] = useState<{ tenantId: string; userId: string } | null>(null);

  const { data: tenants = [] } = useQuery<TenantOption[]>({
    queryKey: ['public-tenants'],
    queryFn: () => api.get('/auth/tenants').then(r => r.data),
    staleTime: 60_000,
  });

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const mfaForm   = useForm<MfaForm>  ({ resolver: zodResolver(mfaSchema) });

  const onLogin = loginForm.handleSubmit(async (data) => {
    try {
      const res = await loginMut.mutateAsync(data);
      if (res.mfaRequired) {
        setMfaState({ tenantId: data.tenantId, userId: res.userId });
      }
    } catch {
      toast.error('Invalid credentials');
    }
  });

  const onMfa = mfaForm.handleSubmit(async (data) => {
    if (!mfaState) return;
    try {
      await mfaMut.mutateAsync({ ...mfaState, token: data.token });
    } catch {
      toast.error('Invalid authenticator code');
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Crosshair className="h-10 w-10 text-primary" />
          </div>
          <CardTitle>CustomWolf Admin</CardTitle>
          <CardDescription>
            {mfaState ? 'Enter your authenticator code' : 'Sign in to manage your game worlds'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!mfaState ? (
            <form onSubmit={onLogin} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="tenantId">Tenant</Label>
                <select
                  id="tenantId"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  {...loginForm.register('tenantId')}
                >
                  <option value="">Select a tenant…</option>
                  {tenants.map(t => (
                    <option key={t.tenantId} value={t.tenantId}>
                      {t.name} — {t.tenantId}
                    </option>
                  ))}
                </select>
                {loginForm.formState.errors.tenantId && (
                  <p className="text-xs text-destructive">{loginForm.formState.errors.tenantId.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="username">Username</Label>
                <Input id="username" autoComplete="username" {...loginForm.register('username')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" {...loginForm.register('password')} />
              </div>
              <Button type="submit" className="w-full" disabled={loginMut.isPending}>
                {loginMut.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          ) : (
            <form onSubmit={onMfa} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="token">6-digit code</Label>
                <Input
                  id="token"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  {...mfaForm.register('token')}
                />
                {mfaForm.formState.errors.token && (
                  <p className="text-xs text-destructive">{mfaForm.formState.errors.token.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={mfaMut.isPending}>
                {mfaMut.isPending ? 'Verifying…' : 'Verify'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setMfaState(null)} type="button">
                Back
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
