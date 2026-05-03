import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth.ts';
import { Layout } from '@/components/Layout.tsx';
import { TenantProvider } from '@/contexts/TenantContext.tsx';
import { Login }     from '@/pages/Login.tsx';
import { Dashboard } from '@/pages/Dashboard.tsx';
import { Tenants }   from '@/pages/Tenants.tsx';
import { Assets }    from '@/pages/Assets.tsx';
import { Levels }    from '@/pages/Levels.tsx';
import { Users }     from '@/pages/Users.tsx';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <TenantProvider><Layout>{children}</Layout></TenantProvider>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/tenants" element={<ProtectedRoute><Tenants /></ProtectedRoute>} />
      <Route path="/assets" element={<ProtectedRoute><Assets /></ProtectedRoute>} />
      <Route path="/levels" element={<ProtectedRoute><Levels /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
