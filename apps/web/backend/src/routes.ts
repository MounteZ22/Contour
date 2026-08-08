import { Router } from 'express';
import type { WebHostContext } from './host.js';
import { createAgentSessionsRouter } from './api/agent-sessions.js';
import { createAiRouter } from './api/ai.js';
import { createChannelsRouter } from './api/channels.js';
import { createClaimsRouter } from './api/claims.js';
import { createDocsRouter } from './api/docs.js';
import { createFlowsRouter } from './api/flows.js';
import { createFilesRouter } from './api/files.js';
import { createProjectRouter } from './api/project.js';
import { createProjectConfigRouter } from './api/project-config.js';
import { createProjectPluginsRouter } from './api/project-plugins.js';
import { createSettingsRouter } from './api/settings.js';

export function createRoutes(context: WebHostContext): Router {
  const router = Router();
  router.use('/agent/sessions', createAgentSessionsRouter(context));
  router.use('/project', createProjectRouter(context));
  router.use('/projects', createProjectConfigRouter(context));
  router.use('/projects', createProjectPluginsRouter(context));
  router.use('/flows', createFlowsRouter(context));
  router.use('/files', createFilesRouter(context));
  router.use('/claims', createClaimsRouter(context));
  router.use('/docs', createDocsRouter(context));
  router.use('/ai', createAiRouter(context));
  router.use('/channels', createChannelsRouter(context));
  router.use('/settings', createSettingsRouter(context));
  return router;
}
