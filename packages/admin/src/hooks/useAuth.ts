import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../lib/api.ts';

export interface AuthUser {
  tenantId: string;
  userId: string;
  username: string;
  role: 'builder' | 'player';
}

export function useAuth() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try { return await authApi.me(); }
      catch { return null; }
    },
    staleTime: 5 * 60_000,
  });

  const loginMut = useMutation({
    mutationFn: ({ tenantId, username, password }: { tenantId: string; username: string; password: string }) =>
      authApi.login(tenantId, username, password),
    onSuccess: async (data) => {
      if (!data.mfaRequired) {
        await qc.invalidateQueries({ queryKey: ['me'] });
        navigate('/');
      }
    },
  });

  const mfaMut = useMutation({
    mutationFn: ({ tenantId, userId, token }: { tenantId: string; userId: string; token: string }) =>
      authApi.verifyMfa(tenantId, userId, token),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/');
    },
  });

  const logoutMut = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      qc.clear();
      navigate('/login');
    },
  });

  return { user, isLoading, loginMut, mfaMut, logoutMut };
}
