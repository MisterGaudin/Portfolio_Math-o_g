import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Configuration Vite : React + Vitest (environnement node pour le moteur pur).
// Le jeu est servi par le portfolio sous /boulet/ : le build compilé est écrit
// dans ../boulet (dossier statique servi tel quel par Vercel).
export default defineConfig({
  base: '/boulet/',
  build: { outDir: '../boulet', emptyOutDir: true },
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
