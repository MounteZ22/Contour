import { Router } from 'express';
import { sendChatMessage, sendChatMessageWithTools, testLLMConnection } from '../services/aiService.js';
import { buildSystemPrompt } from '../services/promptBuilder.js';
import { getToolDefinitions } from '../tools/toolRegistry.js';
import type { ChatRequestBody, AIContextItem } from '../types.js';
import { getChannelById } from '../services/channelManager.js';
import { channelToAgentRuntimeConfig, findDefaultAgentChannel } from '../agent/channel-adapter.js';
import { PiRuntime } from '../agent/pi-runtime.js';
import { contourCustomTools, VAULT_TOOLS_PROMPT } from '../tools/pi-vault-tools.js';


const router = Router();

// ── Pi Agent 路由请求体（本地类型，不放入 types.ts） ──────────────────────────

interface PiChatRequestBody {
  /** 用户消息文本 */
  message: string;
  /**
   * 渠道 ID（可选）
   *
   * 不传时回退到第一个 enabled 且 agent 兼容的渠道，与旧 /chat 的默认渠道
   * 行为对齐。前端目前没有渠道选择 UI，依赖这个回退。
   */
  channelId?: string;
  /**
   * 业务上下文项（可选）
   *
   * 前端选中的 Flow/Doc 引用，通过 buildSystemPrompt() 注入到 Agent 的
   * system prompt，让 Agent 感知当前业务上下文。
   */
  contextItems?: AIContextItem[];
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

    // 2. 获取渠道配置：优先用显式传入的 channelId，否则回退到默认 agent 渠道
    const channel = body.channelId
      ? getChannelById(body.channelId)
      : findDefaultAgentChannel();
    if (!channel) {
      const hint = body.channelId
        ? `渠道不存在: ${body.channelId}`
        : '没有已启用的 Agent 兼容渠道，请先在渠道设置中配置一个 Anthropic 兼容渠道';
      res.status(400).json({ success: false, error: hint });
      return;
    }

    // 3. 构建业务上下文 system prompt（Flow/Doc 注入）+ 业务工具使用引导
    const systemPrompt =
      (await buildSystemPrompt(body.contextItems || [])) +
      "\n\n" +
      VAULT_TOOLS_PROMPT;

    // 4. 转换为 AgentRuntimeConfig（携带 systemPrompt + 自定义业务工具）
    let agentConfig;
    try {
      agentConfig = channelToAgentRuntimeConfig(channel, {
        systemPrompt,
        customTools: contourCustomTools,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: `渠道配置转换失败: ${msg}` });
      return;
    }

    // 5. 通过 PiRuntime 初始化并发送消息
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
