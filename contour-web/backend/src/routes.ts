import { Router } from 'express';
import claimsRouter from './api/claims.js';
import docsRouter from './api/docs.js';
import flowsRouter from './api/flows.js';
import projectRouter from './api/project.js';

const router = Router();

router.use('/project', projectRouter);
router.use('/flows', flowsRouter);
router.use('/claims', claimsRouter);
router.use('/docs', docsRouter);

export default router;
