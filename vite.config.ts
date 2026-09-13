import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

const apiPlugin = (): Plugin => ({
  name: 'api-middleware',
  configureServer(server) {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      if (req.url?.startsWith('/api')) {
        try {
          const { apiRouter } = await import('./server/apiRouter');
          const expressModule = await import('express');
          const express = expressModule.default;
          const app = express();
          app.use(
            express.json({
              verify: (r: any, _res: any, buf: any) => {
                r.rawBody = buf.toString();
              },
              limit: '10mb',
            })
          );
          app.use(express.urlencoded({ extended: true }));
          app.use('/api', apiRouter);
          return app(req, res, next);
        } catch (err) {
          console.error('API middleware error:', err);
          return next(err);
        }
      }
      next();
    });
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
