import { Router } from 'express';
import agentSessionsRouter from './api/agent-sessions.js';
import aiRouter from './api/ai.js';
import channelsRouter from './api/channels.js';
import claimsRouter from './api/claims.js';
import docsRouter from './api/docs.js';
import flowsRouter from './api/flows.js';
import projectRouter from './api/project.js';
import settingsRouter from './api/settings.js';

const router = Router();

router.use('/agent/sessions', agentSessionsRouter);
router.use('/project', projectRouter);
router.use('/flows', flowsRouter);
router.use('/claims', claimsRouter);
router.use('/docs', docsRouter);
router.use('/ai', aiRouter);
router.use('/channels', channelsRouter);
router.use('/settings', settingsRouter);

export default router;
