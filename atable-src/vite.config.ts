import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Configuration Vite : React + Vitest (environnement node pour le moteur pur).
// Le jeu est servi par le portfolio sous /atable/ : le build compilé est écrit
// dans ../atable (dossier statique servi tel quel par Vercel).
export default defineConfig({
  base: '/atable/',
  build: { outDir: '../atable', emptyOutDir: true },
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
