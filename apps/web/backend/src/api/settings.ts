import { Router } from 'express';
import { coreServices } from '../core.js';
import type { AppSettings } from '@contour/shared';
import type { ApiResponse, WebSearchSettingsStatus } from '../types.js';

const { getSettings, getWebSearchSettingsStatus, updateSettings, updateWebSearchSettings } = coreServices.settings;

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

// GET /api/settings/web-search - 只返回启用状态和是否已配置密钥，绝不回显密钥。
router.get('/web-search', async (req, res) => {
  try {
    const settings = await getWebSearchSettingsStatus();
    const response: ApiResponse<WebSearchSettingsStatus> = { success: true, data: settings };
    res.json(response);
  } catch (err) {
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '读取网络检索设置失败' });
  }
});

// POST /api/settings/web-search - API key 仅在本次请求中接收并写入本机配置文件。
router.post('/web-search', async (req, res) => {
  try {
    const settings = await updateWebSearchSettings(req.body);
    const response: ApiResponse<WebSearchSettingsStatus> = { success: true, data: settings };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存网络检索设置失败';
    res.status(400).json({ success: false, error: message });
  }
});

export default router;
