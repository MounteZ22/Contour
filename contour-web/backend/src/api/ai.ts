import { Router } from 'express';
import { sendChatMessage, sendChatMessageWithTools, testLLMConnection } from '../services/aiService.js';
import { buildSystemPrompt } from '../services/promptBuilder.js';
import { getToolDefinitions } from '../tools/toolRegistry.js';
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

    // SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const tools = getToolDefinitions();
    const stream = sendChatMessageWithTools({
      systemPrompt,
      userMessage: body.message,
      tools,
    });

    let hasContent = false;
    try {
      for await (const event of stream) {
        hasContent = true;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      }

      // Fallback: 如果流式没有产出任何内容，回退到非流式
      if (!hasContent) {
        console.warn('[SSE] No streaming content received, falling back to non-stream');
        const fallbackMessage = await sendChatMessage({
          systemPrompt,
          userMessage: body.message,
        });
        if (fallbackMessage) {
          res.write(`data: ${JSON.stringify({ type: 'text', content: fallbackMessage })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (streamError) {
      const msg = streamError instanceof Error ? streamError.message : '流式响应异常';
      res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`);
    } finally {
      res.end();
    }
  } catch (error) {
    if (!res.headersSent) {
      console.error('AI chat error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'AI 服务异常',
      });
    } else {
      console.error('AI stream error:', error);
      res.end();
    }
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
