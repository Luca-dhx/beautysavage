import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { bsAliases, makeApiProxy } from '../../vite.shared';

// App vitrine (beautysavage.fr). Proxy same-origin /api,/auth,/uploads → backend.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: bsAliases },
  server: {
    port: 5173,
    proxy: makeApiProxy(),
  },
});
