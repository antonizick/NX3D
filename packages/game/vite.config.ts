import { defineConfig } from 'vite';

export default defineConfig({
  base: '/game/',
  server: {
    port: 5174,
    proxy: {
      '/api':    { target: 'http://localhost:3001', changeOrigin: true },
      '/assets': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
});
