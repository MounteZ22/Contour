import { Router } from 'express';
import { sendChatMessage, testLLMConnection } from '../services/aiService.js';
import { buildSystemPrompt } from '../services/promptBuilder.js';
import type { ChatRequestBody } from '../types.js';

const router = Router();

router.post('/chat', async (req, res) => {
  try {
    const body = req.body as ChatRequestBody;

    if (!body.message || typeof body.message !== 'string') {
      res.status(400).json({ success: false, error: '消息不能为空' });
      return;
    }

    const systemPrompt = await buildSystemPrompt(body.contextItems || []);

    const assistantMessage = await sendChatMessage({
      systemPrompt,
      userMessage: body.message,
    });

    res.json({
      success: true,
      data: {
        message: assistantMessage,
        role: 'assistant',
        conversationId: 'conv_' + Date.now(),
      },
    });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'AI 服务异常',
    });
  }
});

router.post('/test', async (req, res) => {
  try {
    const result = await testLLMConnection();
    res.json({ success: result.success, data: result });
  } catch (error) {
    console.error('AI test error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '测试失败',
    });
  }
});

export default router;
