import { Router } from 'express';
import { sendChatMessage, sendChatMessageWithTools, testLLMConnection } from '../services/aiService.js';
import { buildSystemPrompt } from '../services/promptBuilder.js';
import { getToolDefinitions } from '../tools/toolRegistry.js';
import type { ChatRequestBody } from '../types.js';
import { getChannelById } from '../services/channelManager.js';
import { channelToAgentRuntimeConfig } from '../agent/channel-adapter.js';
import { PiRuntime } from '../agent/pi-runtime.js';


const router = Router();

// ── Pi Agent 实验性路由请求体（本地类型，不放入 types.ts） ──────────────────

interface PiChatRequestBody {
  /** 用户消息文本 */
  message: string;
  /** 渠道 ID */
  channelId: string;
}

// ── 路由 ──────────────────────────────────────────────────────────────────────

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

/**
 * POST /api/ai/pi-chat
 *
 * 通过 PiRuntime（AgentRuntime 接口实现）发送消息并流式返回结果。
 * 完整链路：渠道配置 → channelToAgentRuntimeConfig() → PiRuntime.init() → SSE 事件流。
 *
 * 与之前绕过 PiRuntime 的 workaround 不同，此版本通过 AgentRuntime 接口交互，
 * 符合架构设计：业务代码不直接依赖 Pi SDK 细节。
 */
router.post('/pi-chat', async (req, res) => {
  let runtime: PiRuntime | null = null;

  try {
    // 1. 解析请求参数
    const body = req.body as PiChatRequestBody;
    if (!body.message || typeof body.message !== 'string') {
      res.status(400).json({ success: false, error: '消息不能为空' });
      return;
    }
    if (!body.channelId || typeof body.channelId !== 'string') {
      res.status(400).json({ success: false, error: '缺少 channelId 参数' });
      return;
    }

    // 2. 获取渠道配置
    const channel = getChannelById(body.channelId);
    if (!channel) {
      res.status(400).json({ success: false, error: `渠道不存在: ${body.channelId}` });
      return;
    }

    // 3. 转换为 AgentRuntimeConfig
    let agentConfig;
    try {
      agentConfig = channelToAgentRuntimeConfig(channel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: `渠道配置转换失败: ${msg}` });
      return;
    }

    // 4. 通过 PiRuntime 初始化并发送消息（不再绕过 PiRuntime 直接调用 SDK）
    runtime = new PiRuntime();
    await runtime.init(agentConfig);

    // 5. 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 6. 消费 PiRuntime.prompt() 事件流 → SSE 输出
    for await (const event of runtime.prompt(body.message)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (error) {
    if (!res.headersSent) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: msg });
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`);
      } catch {
        // res.write 失败则静默
      }
    }
  } finally {
    // 7. 释放 PiRuntime 资源
    if (runtime) {
      runtime.dispose();
    }
    if (res.headersSent && !res.writableEnded) {
      res.end();
    }
  }
});

export default router;
