import { Router } from 'express';
import { CONFIG } from '../config.js';
import type { ApiResponse, Claim } from '../types.js';
import { loadProjects } from '../vault/loader.js';

const router = Router();

// GET /api/claims - 所有 claims
router.get('/', async (_req, res) => {
  try {
    const projects = await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);
    const claims = projects.flatMap((p) => p.claims);
    const response: ApiResponse<{ claims: Claim[] }> = { success: true, data: { claims } };
    res.json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

export default router;
