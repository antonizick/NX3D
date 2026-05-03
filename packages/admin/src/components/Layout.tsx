import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth.ts';
import { useTenant } from '@/contexts/TenantContext.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select.tsx';
import {
  LayoutDashboard, Building2, Image, Map, Users, LogOut, Crosshair,
} from 'lucide-react';
import { cn } from '@/lib/utils.ts';

const NAV = [
  { to: '/',        label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/tenants', label: 'Tenants',    icon: Building2 },
  { to: '/assets',  label: 'Assets',     icon: Image },
  { to: '/levels',  label: 'Levels',     icon: Map },
  { to: '/users',   label: 'Users',      icon: Users },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logoutMut } = useAuth();
  const { tenantId, setTenantId, tenants } = useTenant();
  const location = useLocation();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 border-r flex flex-col">
        <div className="flex items-center gap-2 p-4 border-b">
          <Crosshair className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg">CustomWolf</span>
        </div>

        {/* Tenant selector */}
        <div className="px-3 py-2 border-b bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1 font-medium">Editing tenant</p>
          {tenants.length > 1 ? (
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="h-8 text-xs w-full">
                <SelectValue placeholder="Select tenant…" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map(t => (
                  <SelectItem key={t.tenantId} value={t.tenantId} className="text-xs">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs font-semibold truncate">
              {tenants.find(t => t.tenantId === tenantId)?.name ?? '—'}
            </p>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to}>
              <div className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                location.pathname === to
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground'
              )}>
                <Icon className="h-4 w-4" />
                {label}
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t">
          <div className="text-xs text-muted-foreground mb-2">
            {user?.username} · {user?.role}
          </div>
          <Button
            variant="outline" size="sm" className="w-full"
            onClick={() => logoutMut.mutate()}
          >
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  );
}
