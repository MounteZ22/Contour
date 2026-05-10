import { Router } from 'express';
import { CONFIG } from '../config.js';
import type { ApiResponse, Claim } from '../types.js';
import { loadProjects } from '../vault/loader.js';
import { ValidationError } from '../vault/validate.js';

const router = Router();

// GET /api/claims - 所有 claims
router.get('/', async (req, res) => {
  try {
    const projects = await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);
    const claims = projects.flatMap((p) => p.claims);
    const response: ApiResponse<{ claims: Claim[] }> = { success: true, data: { claims } };
    res.json(response);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
