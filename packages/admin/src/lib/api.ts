import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url: string = err.config?.url ?? '';
    if (err.response?.status === 401 && !url.includes('/auth/me')) {
      window.location.href = '/admin/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (tenantId: string, username: string, password: string) =>
    api.post('/auth/login', { tenantId, username, password }).then(r => r.data),
  verifyMfa: (tenantId: string, userId: string, token: string) =>
    api.post('/auth/verify-mfa', { tenantId, userId, token }).then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  me:     () => api.get('/auth/me').then(r => r.data),
  mfaSetup:  () => api.get('/auth/mfa-setup').then(r => r.data),
  mfaEnable: (token: string) => api.post('/auth/mfa-enable', { token }).then(r => r.data),
};

// ─── Tenants ──────────────────────────────────────────────────────────────────
export const tenantsApi = {
  list:   () => api.get('/tenants').then(r => r.data),
  get:    (id: string) => api.get(`/tenants/${id}`).then(r => r.data),
  create: (name: string) => api.post('/tenants', { name }).then(r => r.data),
  update: (id: string, data: unknown) => api.put(`/tenants/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/tenants/${id}`).then(r => r.data),
  uploadLogo: (id: string, file: File) => {
    const form = new FormData();
    form.append('files', file);
    return api.post(`/tenants/${id}/logo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
  deleteLogo: (id: string) => api.delete(`/tenants/${id}/logo`).then(r => r.data),
  clone: (id: string, name: string) => api.post(`/tenants/${id}/clone`, { name }).then(r => r.data),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  list:   (tenantId: string) => api.get(`/tenants/${tenantId}/users`).then(r => r.data),
  create: (tenantId: string, data: { username: string; password: string; role: string }) =>
    api.post(`/tenants/${tenantId}/users`, data).then(r => r.data),
  update: (tenantId: string, userId: string, data: { password?: string; role?: string }) =>
    api.put(`/tenants/${tenantId}/users/${userId}`, data).then(r => r.data),
  delete: (tenantId: string, userId: string) =>
    api.delete(`/tenants/${tenantId}/users/${userId}`).then(r => r.data),
};

// ─── Assets ───────────────────────────────────────────────────────────────────
export const assetsApi = {
  list: (tenantId: string, category: string, subId?: string) => {
    const params = new URLSearchParams({ category });
    if (subId) params.set('subId', subId);
    return api.get(`/tenants/${tenantId}/assets?${params}`).then(r => r.data);
  },
  upload: (
    tenantId: string,
    category: string,
    files: File[],
    subId?: string,
    onProgress?: (pct: number) => void
  ) => {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    const params = new URLSearchParams({ category });
    if (subId) params.set('subId', subId);
    return api.post(`/tenants/${tenantId}/assets/upload?${params}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => onProgress?.(Math.round((e.loaded / (e.total ?? 1)) * 100)),
    }).then(r => r.data);
  },
  delete: (tenantId: string, category: string, filename: string, subId?: string) =>
    api.delete(`/tenants/${tenantId}/assets`, { data: { category, filename, subId } }).then(r => r.data),
  resetToDefault: (tenantId: string, category: string, filename: string, subId?: string) =>
    api.post(`/tenants/${tenantId}/assets/reset`, { category, filename, subId }).then(r => r.data),
};

// ─── Levels ───────────────────────────────────────────────────────────────────
export const levelsApi = {
  list: (tenantId: string) => api.get(`/tenants/${tenantId}/levels`).then(r => r.data),
  get:  (tenantId: string, levelId: number) =>
    api.get(`/tenants/${tenantId}/levels/${levelId}`).then(r => r.data),
  generateAll: (tenantId: string, difficulty = 'normal') =>
    api.post(`/tenants/${tenantId}/levels/generate`, { difficulty }).then(r => r.data),
  regenerate:  (tenantId: string, levelId: number, opts: { difficulty?: string; episode?: number }) =>
    api.post(`/tenants/${tenantId}/levels/${levelId}/regenerate`, opts).then(r => r.data),
  deleteAll: (tenantId: string) =>
    api.delete(`/tenants/${tenantId}/levels`).then(r => r.data),
  updateMessages: (tenantId: string, levelId: number, data: { onLoadMessage?: string; onExitMessage?: string }) =>
    api.patch(`/tenants/${tenantId}/levels/${levelId}`, data).then(r => r.data),
};

// ─── Deploy ───────────────────────────────────────────────────────────────────
export const deployApi = {
  build:    (id: string) => api.post(`/tenants/${id}/deploy`).then(r => r.data),
  status:   (id: string) => api.get(`/tenants/${id}/deploy`).then(r => r.data),
  downloadUrl: (id: string) => `/api/tenants/${id}/deploy/download`,
};

export default api;
