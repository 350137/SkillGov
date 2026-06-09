// Vite configuration for the SkillGov control panel React SPA — dev proxy to API server, Tailwind CSS plugin.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4173',
    },
  },
  build: {
    outDir: 'dist/spa',
    emptyOutDir: true,
  },
});
