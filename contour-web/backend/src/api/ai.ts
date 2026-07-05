import { Router } from 'express';
import { testLLMConnection } from '../services/aiService.js';
import { buildSystemPrompt } from '../services/promptBuilder.js';
import type { AIContextItem } from '../types.js';
import { getChannelById } from '../services/channelManager.js';
import { channelToAgentRuntimeConfig, findDefaultAgentChannel } from '../agent/channel-adapter.js';
import { PiRuntime } from '../agent/pi-runtime.js';
import { CONFIG } from '../config.js';
import { contourCustomTools, VAULT_TOOLS_PROMPT } from '../tools/pi-vault-tools.js';
import { resolvePermissionRequest } from '../agent/permission-extension.js';
import { findProjectDir } from '../vault/locate.js';
import { ensureProjectDir } from '../services/projectManager.js';
import path from 'node:path';


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
  /**
   * 权限模式（可选，缺省 "readonly"）
   *
   * - "readonly"：只开只读工具，写工具不可用（默认，最安全）
   * - "yolo"：所有工具开放，不拦截
   * - "review"：所有工具开放，写操作被 tool_call 钩子拦截（确认 UI 待实现）
   */
  permissionMode?: "readonly" | "review" | "yolo";
  /**
   * 项目 ID（可选）
   *
   * 对应 VAULTS_DIR 下项目子目录的 projectId（如 "PRJ_001"）。
   * 用于确定 Agent cwd 和数据隔离目录。不传时 cwd 回退到 VAULTS_DIR。
   */
  projectId?: string;
  /**
   * 会话 ID（可选）
   *
   * 传此值可恢复已有会话的对话历史。服务端在 dataDir/projects/{projectId}/sessions/
   * 目录下查找对应的持久化文件，加载历史消息作为上下文。
   */
  sessionId?: string;
}

// ── 路由 ──────────────────────────────────────────────────────────────────────

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

    // 3. 确定项目目录和存储名称
    //    - 如果前端传了 projectId，用 findProjectDir 解析实际项目子目录
    //    - 不传则回退到 VAULTS_DIR 根（单项目兼容模式）
    //    - 存储名用目录的 basename（如 "PRJ_001_示例研究项目"），和文件系统一致
    let projectDir = CONFIG.VAULTS_DIR;
    let projectName = "default";
    if (body.projectId) {
      const found = await findProjectDir(body.projectId);
      if (found) {
        projectDir = found;
        projectName = path.basename(projectDir);
        console.log(`[Pi-chat] 项目目录: ${projectDir}`);
        // 编码验证：输出每个字符的 Unicode 码点，用于排查 UTF-8 路径在
        // Node.js 文件系统链路中是否被破坏（如遇到乱码目录名可与之对比）。
        console.log(`[Pi-chat] 项目名编码验证:`,
          Array.from(projectName).map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`).join(' '));
      } else {
        console.warn(`[Pi-chat] 项目 ${body.projectId} 未找到，回退到 VAULTS_DIR`);
        projectName = body.projectId; // 前端传了但目录没了，仍用原名隔离
      }
    }

    // 确保 C 盘项目数据目录已初始化，config.json 记录 D 盘项目路径
    // 注意：不再用 projectName !== "default" 守卫，因为即使没有传 projectId，
    // pi-runtime 的 mkdirSync 会递归创建 projects/default/sessions/，
    // 必须确保 config.json 被写入。
    ensureProjectDir(projectName, projectDir);

    // 4. 构建业务上下文 system prompt（Flow/Doc 注入）+ 业务工具使用引导
    const systemPrompt =
      (await buildSystemPrompt(body.contextItems || [])) +
      "\n\n" +
      VAULT_TOOLS_PROMPT;

    // 5. 转换为 AgentRuntimeConfig（携带 systemPrompt + 自定义业务工具 + 权限模式）
    let agentConfig;
    try {
      agentConfig = channelToAgentRuntimeConfig(channel, {
        systemPrompt,
        customTools: contourCustomTools,
        permissionMode: body.permissionMode,
        sessionId: body.sessionId,
        dataDir: CONFIG.DATA_DIR,
        projectDir,
        projectId: projectName,
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

/**
 * POST /api/ai/permission-response
 *
 * 接收用户对工具权限请求的决策，传递给 permission-extension 中等待的 Promise。
 * 由前端的 PermissionDialog 在用户点击"允许"/"拒绝"后调用。
 */
router.post('/permission-response', (req, res) => {
  try {
    const { requestId, action, remember } = req.body as {
      requestId: string;
      action: "allow" | "deny";
      remember?: boolean;
    };

    if (!requestId || !action) {
      res.status(400).json({ success: false, error: '缺少必要参数 requestId 或 action' });
      return;
    }
    if (action !== "allow" && action !== "deny") {
      res.status(400).json({ success: false, error: 'action 必须是 "allow" 或 "deny"' });
      return;
    }

    const resolved = resolvePermissionRequest(requestId, action, remember ?? false);
    if (!resolved) {
      res.status(404).json({ success: false, error: '权限请求不存在或已过期' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '处理权限响应失败';
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
