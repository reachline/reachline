import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // The server runs on 5200 in development (server/package.json); proxying keeps
  // one origin, so cookies and the csrf check behave as in production.
  server: { host: '127.0.0.1', port: 5199, strictPort: true, proxy: { '/api': 'http://127.0.0.1:5200' } },
});
