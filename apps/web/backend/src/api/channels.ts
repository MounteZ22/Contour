import { Router } from 'express';
import type { WebHostContext } from '../host.js';
import type {
  Channel,
  ChannelCreateInput,
  ChannelUpdateInput,
  ChannelTestResult,
  FetchModelsResult,
} from '@contour/shared';
import type {
  ApiResponse,
  FetchModelsInput,
} from '../types.js';

type PublicChannel = Omit<Channel, 'apiKey'>;

function toPublicChannel(channel: Channel): PublicChannel {
  const { apiKey: _apiKey, ...publicChannel } = channel;
  return publicChannel;
}

export function createChannelsRouter(context: WebHostContext): Router {
const { listChannels, createChannel, updateChannel, deleteChannel, listAgentModelOptions, testChannelDirect, testChannelById, fetchModels } = context.coreServices.channels;

const router = Router();

// GET /api/channels - 获取所有渠道
router.get('/', async (req, res) => {
  try {
    const channels = await listChannels();
    const response: ApiResponse<{ channels: PublicChannel[] }> = {
      success: true,
      data: { channels: channels.map(toPublicChannel) },
    };
    res.json(response);
  } catch (err) {
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '获取渠道列表失败' });
  }
});

// GET /api/channels/agent-models - Agent 选择器的无凭据可用模型列表
router.get('/agent-models', async (req, res) => {
  try {
    const models = await listAgentModelOptions();
    res.json({ success: true, data: { models } });
  } catch (err) {
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '获取可用模型失败' });
  }
});

// POST /api/channels - 创建渠道
router.post('/', async (req, res) => {
  try {
    const input = req.body as ChannelCreateInput;
    if (!input.name || !input.provider || !input.baseUrl || !input.apiKey) {
      res.status(400).json({ success: false, error: '名称、供应商、Base URL 和 API Key 为必填项' });
      return;
    }
    const channel = await createChannel(input);
    const response: ApiResponse<{ channel: Channel }> = { success: true, data: { channel } };
    res.status(201).json(response);
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '创建渠道失败' });
  }
});

// PATCH /api/channels/:id - 更新渠道
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const input = req.body as ChannelUpdateInput;
    const channel = await updateChannel(id, input);
    const response: ApiResponse<{ channel: Channel }> = { success: true, data: { channel } };
    res.json(response);
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '更新渠道失败' });
  }
});

// DELETE /api/channels/:id - 删除渠道
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteChannel(id);
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '删除渠道失败' });
  }
});

// POST /api/channels/:id/test - 测试已保存渠道
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await testChannelById(id);
    const response: ApiResponse<ChannelTestResult> = { success: result.success, data: result };
    res.json(response);
  } catch (err) {
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '测试失败' });
  }
});

// POST /api/channels/test-direct - 直接测试（无需已保存）
router.post('/test-direct', async (req, res) => {
  try {
    const input = req.body as FetchModelsInput;
    if (!input.provider || !input.baseUrl || !input.apiKey) {
      res.status(400).json({ success: false, error: 'provider、baseUrl 和 apiKey 为必填项' });
      return;
    }
    const result = await testChannelDirect(input);
    const response: ApiResponse<ChannelTestResult> = { success: result.success, data: result };
    res.json(response);
  } catch (err) {
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '测试失败' });
  }
});

// POST /api/channels/fetch-models - 拉取模型列表
router.post('/fetch-models', async (req, res) => {
  try {
    const input = req.body as FetchModelsInput;
    if (!input.provider || !input.baseUrl || !input.apiKey) {
      res.status(400).json({ success: false, error: 'provider、baseUrl 和 apiKey 为必填项' });
      return;
    }
    const result = await fetchModels(input);
    const response: ApiResponse<FetchModelsResult> = { success: result.success, data: result };
    res.json(response);
  } catch (err) {
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '拉取模型失败' });
  }
});

return router;
}
