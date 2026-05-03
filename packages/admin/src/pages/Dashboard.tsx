import { useQuery } from '@tanstack/react-query';
import { Building2, Map, Users, Image } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { tenantsApi, levelsApi, usersApi } from '@/lib/api.ts';
import { useAuth } from '@/hooks/useAuth.ts';

export function Dashboard() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? '';

  const { data: tenant } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn:  () => tenantsApi.get(tenantId),
    enabled:  !!tenantId,
  });

  const { data: levelsData } = useQuery({
    queryKey: ['levels', tenantId],
    queryFn:  () => levelsApi.list(tenantId),
    enabled:  !!tenantId,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users', tenantId],
    queryFn:  () => usersApi.list(tenantId),
    enabled:  !!tenantId,
  });

  const stats = [
    {
      label: 'Tenant',
      value: tenant?.name ?? '—',
      icon:  Building2,
    },
    {
      label: 'Levels',
      value: levelsData?.levels?.length ?? 0,
      icon:  Map,
    },
    {
      label: 'Users',
      value: usersData?.length ?? 0,
      icon:  Users,
    },
    {
      label: 'Episodes',
      value: tenant?.game?.episodes ?? '—',
      icon:  Image,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.username}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {tenant && (
        <Card>
          <CardHeader>
            <CardTitle>{tenant.game?.title ?? tenant.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-4">
              <span className="text-muted-foreground">Episodes:</span>
              <span>{tenant.game?.episodes}</span>
            </div>
            <div className="flex gap-4">
              <span className="text-muted-foreground">Levels per episode:</span>
              <span>{tenant.game?.levelsPerEpisode}</span>
            </div>
            <div className="flex gap-4">
              <span className="text-muted-foreground">Starting lives:</span>
              <span>{tenant.game?.startingLives}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
