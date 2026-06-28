import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { bsAliases } from './vite.shared';

// Tests frontend (apps + packages). Environnement jsdom + Testing Library.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: bsAliases },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'apps/**/src/**/*.test.{ts,tsx}',
      'packages/**/src/**/*.test.{ts,tsx}',
    ],
  },
});
