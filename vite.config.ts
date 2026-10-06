import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// @ts-expect-error -- plain ESM helpers shared with the production server
import { attachSignaling } from './server/signaling.mjs';
// @ts-expect-error -- plain ESM helpers shared with the production server
import { proxyRetroAchievements } from './server/ra-proxy.mjs';

/** Netplay signaling and the RetroAchievements proxy, available under `npm run dev` too. */
function dreamportServer(): Plugin {
  const setup = (server: ViteDevServer | PreviewServer) => {
    if (server.httpServer) attachSignaling(server.httpServer);
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname.startsWith('/ra/')) void proxyRetroAchievements(req, res, url);
      else next();
    });
  };
  return { name: 'dreamport-server', configureServer: setup, configurePreviewServer: setup };
}

export default defineConfig({
  plugins: [react(), dreamportServer()],
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)) } },
  },
});
