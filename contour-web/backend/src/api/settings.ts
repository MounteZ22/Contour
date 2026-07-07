import { Router } from 'express';
import { getSettings, updateSettings } from '../services/settingsService.js';
import type { ApiResponse, AppSettings } from '../types.js';

const router = Router();

// GET /api/settings - 获取应用设置
router.get('/', async (req, res) => {
  try {
    const settings = await getSettings();
    const response: ApiResponse<AppSettings> = { success: true, data: settings };
    res.json(response);
  } catch (err) {
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '读取设置失败' });
  }
});

// POST /api/settings - 更新应用设置
router.post('/', async (req, res) => {
  try {
    const updates = req.body as Partial<AppSettings>;
    const updated = await updateSettings(updates);
    const response: ApiResponse<AppSettings> = { success: true, data: updated };
    res.json(response);
  } catch (err) {
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '保存设置失败' });
  }
});

export default router;
