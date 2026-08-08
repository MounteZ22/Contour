import type { Server } from 'node:http';
import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import type { CoreRuntimeConfig } from '@contour/core/runtime';
import { createWebHostContext, type WebHostContext, type WebHostOptions } from './host.js';
import { createRoutes } from './routes.js';
import { createProjectsRouter } from './api/projects.js';
import { errorHandler } from './middleware/errorHandler.js';

export interface CreateAppOptions extends WebHostOptions {
  context?: WebHostContext;
  coreConfig?: CoreRuntimeConfig;
}

export interface StartedWebServer {
  app: Express;
  context: WebHostContext;
  server: Server;
  port: number;
  host: '127.0.0.1';
  close: () => Promise<void>;
}

function resolveCoreConfig(options: CreateAppOptions): CoreRuntimeConfig {
  if (!options.context && !options.coreConfig) {
    throw new Error('createApp requires coreConfig or context');
  }
  return options.coreConfig!;
}

export function createApp(options: CreateAppOptions): Express {
  const context = options.context ?? createWebHostContext(resolveCoreConfig(options), options);
  const app = express();

  if (context.mode === 'development') {
    app.use(cors({
      origin(origin, callback) {
        if (!origin || context.corsOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Origin is not allowed by Contour development CORS policy'));
      },
    }));
  }

  app.use(express.json({ limit: '5mb' }));
  app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));
  app.use('/api', createRoutes(context));
  app.use('/api/projects', createProjectsRouter(context));

  if (context.staticDir) {
    const indexFile = path.join(context.staticDir, 'index.html');
    app.use(express.static(context.staticDir));
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => res.sendFile(indexFile));
  }

  app.use(errorHandler);
  return app;
}

export async function startServer(options: CreateAppOptions): Promise<StartedWebServer> {
  const context = options.context ?? createWebHostContext(resolveCoreConfig(options), options);
  const app = createApp({ context });
  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(context.config.port, '127.0.0.1', () => resolve(candidate));
    candidate.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Contour server did not expose a TCP port');
  return {
    app,
    context,
    server,
    port: address.port,
    host: '127.0.0.1',
    close: () => new Promise((resolve, reject) => {
      // 先断开空闲连接，再留 5s 兜底强制关闭活跃连接（如 SSE 长连接），
      // 避免 Electron 退出时 server.close() 无限等待拖慢退出。
      server.closeIdleConnections();
      const forceCloseTimer = setTimeout(() => server.closeAllConnections(), 5_000);
      server.close((error) => {
        clearTimeout(forceCloseTimer);
        error ? reject(error) : resolve();
      });
    }),
  };
}
