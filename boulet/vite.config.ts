import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Configuration Vite : React + Vitest (environnement node pour le moteur pur).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
