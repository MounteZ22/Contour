import 'dotenv/config';
import { CORE_RUNTIME_CONFIG, CONFIG } from './config.js';
import { createWebHostContext } from './host.js';
import { startServer } from './app.js';

const context = createWebHostContext(CORE_RUNTIME_CONFIG, {
  port: CONFIG.PORT,
  mode: CONFIG.IS_DEV ? 'development' : 'production',
});
const started = await startServer({ context });

console.log(`Contour backend running on http://${started.host}:${started.port}`);

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, closing server...`);
  await started.close();
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
