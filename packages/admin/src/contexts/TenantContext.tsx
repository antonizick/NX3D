import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantsApi } from '@/lib/api.ts';
import { useAuth } from '@/hooks/useAuth.ts';

const STORAGE_KEY = 'cw_admin_tenant';

interface TenantInfo { tenantId: string; name: string; }

interface TenantCtx {
  tenantId: string;
  setTenantId: (id: string) => void;
  tenants: TenantInfo[];
}

const Ctx = createContext<TenantCtx | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenantId, setTenantIdState] = useState('');

  const { data: tenants = [] } = useQuery<TenantInfo[]>({
    queryKey: ['tenants'],
    queryFn: tenantsApi.list,
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && tenants.some(t => t.tenantId === stored)) {
      setTenantIdState(stored);
    } else if (user.tenantId && !tenantId) {
      setTenantIdState(user.tenantId);
    }
  }, [user?.tenantId, tenants.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTenantId = (id: string) => {
    setTenantIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <Ctx.Provider value={{ tenantId, setTenantId, tenants }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTenant(): TenantCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
