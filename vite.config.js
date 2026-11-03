import { defineConfig } from 'vite';

export default defineConfig({
  // Em dev, /api vai para as Pages Functions (npm run api, porta 8788).
  server: { proxy: { '/api': 'http://localhost:8788' } },
  // Nada inline em data: — a CSP (public/_headers) só aceita fontes/scripts do próprio domínio.
  build: { assetsInlineLimit: 0 },
});
