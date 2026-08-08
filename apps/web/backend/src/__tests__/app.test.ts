import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, startServer, type StartedWebServer } from '../app.js';
import { createWebHostContext } from '../host.js';

const tempDirs: string[] = [];
const servers: StartedWebServer[] = [];

function createContext(staticDir?: string) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contour-web-host-'));
  tempDirs.push(dataDir);
  return createWebHostContext({
    dataDir,
    projectsDir: path.join(dataDir, 'projects'),
    vaultsDir: path.join(dataDir, 'vaults'),
    legacyVault: path.join(dataDir, 'legacy'),
    isDevelopment: false,
  }, { port: 0, mode: 'production', staticDir });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('embeddable web host', () => {
  it('serves renderer files, SPA fallback, and keeps API separate', async () => {
    const renderer = fs.mkdtempSync(path.join(os.tmpdir(), 'contour-renderer-'));
    tempDirs.push(renderer);
    fs.writeFileSync(path.join(renderer, 'index.html'), '<main>Contour</main>');
    const app = createApp({ context: createContext(renderer) });

    await request(app).get('/').expect(200).expect('Content-Type', /html/).expect(/Contour/);
    await request(app).get('/agent/session-1').expect(200).expect(/Contour/);
    await request(app).get('/api/settings').expect(200).expect((response) => {
      expect(response.body.success).toBe(true);
    });
    await request(app).get('/api/not-a-route').expect(404);
  });

  it('binds an ephemeral port and reports its actual loopback address', async () => {
    const started = await startServer({ context: createContext() });
    servers.push(started);
    expect(started.host).toBe('127.0.0.1');
    expect(started.port).toBeGreaterThan(0);
    const response = await fetch(`http://${started.host}:${started.port}/api/not-a-route`);
    expect(response.status).toBe(404);
  });
});
