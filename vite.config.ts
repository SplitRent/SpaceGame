import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, open: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
