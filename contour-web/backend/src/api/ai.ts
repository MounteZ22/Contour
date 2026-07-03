import { Router } from 'express';
import { sendChatMessage, sendChatMessageWithTools, testLLMConnection } from '../services/aiService.js';
import { buildSystemPrompt } from '../services/promptBuilder.js';
import { getToolDefinitions } from '../tools/toolRegistry.js';
import type { ChatRequestBody } from '../types.js';
import { getChannelById } from '../services/channelManager.js';
import { channelToAgentRuntimeConfig } from '../agent/channel-adapter.js';
import type { AgentStreamEvent } from '../agent/agent-runtime.js';
import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SettingsManager,
  DefaultResourceLoader,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';


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
 * 实验性路由：通过 Pi Agent SDK 发送消息并流式返回结果。
 * 完整链路：渠道配置 → AgentRuntimeConfig → createAgentSession → SSE 事件流。
 *
 * 注意：本路由直接使用 @earendil-works/pi-coding-agent 的 createAgentSession
 * API，而非通过 PiRuntime 封装。原因是 PiRuntime.init() 创建的 session
 * 在 subscribe 时无法收到 message_update 事件（已确认为 bug，根因待查）。
 */
router.post('/pi-chat', async (req, res) => {
  let session: AgentSession | null = null;

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

    // 4. 创建 Pi Agent Session（与 PiRuntime.init() 逻辑等价）
    const authStorage = AuthStorage.create();
    authStorage.setRuntimeApiKey('anthropic', agentConfig.apiKey);

    const modelRegistry = ModelRegistry.create(authStorage);
    // 注意：channelToAgentRuntimeConfig 返回的 baseUrl 已经过 normalizeAnthropicBaseUrl
    // 处理（追加了 /v1 后缀），但 Pi SDK 的 registerProvider 内部也会自行追加版本路径。
    // 如果这里直接传入带 /v1 的 URL，会导致双重版本路径（如 /v1/v1/messages），造成 404。
    // 因此需要剥离 /v\d+ 后缀，让 Pi SDK 自行处理版本路径。
    const piBaseUrl = agentConfig.baseUrl.replace(/\/v\d+$/, '');
    modelRegistry.registerProvider('anthropic', { baseUrl: piBaseUrl });

    const model = modelRegistry.find('anthropic', agentConfig.model);
    if (!model) {
      res.status(400).json({
        success: false,
        error: `未找到模型: anthropic/${agentConfig.model}`,
      });
      return;
    }

    const resourceLoader = new DefaultResourceLoader({
      cwd: agentConfig.cwd,
      agentDir: agentConfig.cwd,
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 1 },
      }),
    });
    await resourceLoader.reload();

    const createResult = await createAgentSession({
      cwd: agentConfig.cwd,
      agentDir: agentConfig.cwd,
      model,
      thinkingLevel: 'off',
      authStorage,
      modelRegistry,
      tools: agentConfig.tools ?? ['read'],
      resourceLoader,
      sessionManager: SessionManager.inMemory(),
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 1 },
      }),
    });
    session = createResult.session;

    // 5. 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 6. 构建 session → SSE 事件桥
    await new Promise<void>((resolve, reject) => {
      let streamEnded = false;

      const unsubscribe = session!.subscribe((event: AgentSessionEvent) => {
        if (streamEnded) return;

        try {
          const mapped = mapSessionEvent(event);
          if (mapped) {
            res.write(`data: ${JSON.stringify(mapped)}\n\n`);
          }

          if (event.type === 'agent_end') {
            streamEnded = true;
            unsubscribe();
            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            resolve();
          }
        } catch (err) {
          streamEnded = true;
          unsubscribe();
          reject(err);
        }
      });

      // 发送 prompt（不 await，事件通过 subscribe 回调接收）
      session!.prompt(body.message).catch((err: unknown) => {
        if (!streamEnded) {
          const msg = err instanceof Error ? err.message : String(err);
          res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`);
        }
      });
    });
  } catch (error) {
    // 7. 错误处理
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
    // 8. 释放资源
    if (session) {
      session.dispose();
    }
    if (res.headersSent && !res.writableEnded) {
      res.end();
    }
  }
});

/**
 * 将 Pi SDK 的 AgentSessionEvent 映射为 AgentStreamEvent
 *
 * 与 PiRuntime.mapEvent() 逻辑完全一致（复制于此是因为 pi-chat 路由
 * 绕过 PiRuntime 直接使用 AgentSession）。
 */
function mapSessionEvent(event: AgentSessionEvent): AgentStreamEvent | null {
  switch (event.type) {
    case 'agent_start':
      return { type: 'agent_start' };
    case 'agent_end':
      return { type: 'agent_end' };
    case 'turn_start':
      return { type: 'turn_start' };
    case 'turn_end':
      return { type: 'turn_end' };
    case 'message_update': {
      const sub = (event as any).assistantMessageEvent;
      if (!sub) return null;
      switch (sub.type) {
        case 'text_delta':
          return { type: 'text_delta', delta: sub.delta };
        case 'thinking_delta':
          return { type: 'thinking_delta', delta: sub.delta };
        default:
          return null;
      }
    }
    case 'tool_execution_start':
      return {
        type: 'tool_call_start',
        toolName: (event as any).toolName ?? 'unknown',
      };
    case 'tool_execution_end':
      return {
        type: 'tool_call_end',
        toolName: (event as any).toolName ?? 'unknown',
        isError: !!(event as any).isError,
      };
    default:
      return null;
  }
}

export default router;
