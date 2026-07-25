import { Router, type Response } from 'express';
import { testLLMConnection } from '../services/aiService.js';
import { buildAgentPrompt } from '../services/promptBuilder.js';
import type { AIContextItem } from '../types.js';
import { getChannelById } from '../services/channelManager.js';
import { channelToAgentRuntimeConfig, findDefaultAgentChannel } from '../agent/channel-adapter.js';
import { PiRuntime } from '../agent/pi-runtime.js';
import { CONFIG } from '../config.js';
import { createContourCustomTools } from '../tools/pi-vault-tools.js';
import { resolvePermissionRequest } from '../agent/permission-extension.js';
import { findProjectDir } from '../vault/locate.js';
import { ensureProjectDir } from '../services/projectManager.js';
import path from 'node:path';
import { agentErrorHttpStatus, classifyAgentError, typedAgentError } from '../agent/typed-error.js';
import { loadProjects } from '../vault/loader.js';


const router = Router();

function sendAgentHttpError(res: Response, error: unknown, status?: number): void {
  const payload = classifyAgentError(error);
  res.status(status ?? agentErrorHttpStatus(payload)).json({ success: false, error: payload });
}

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
   * 前端选中的 Flow/Doc 引用，每轮通过 buildAgentPrompt() 重新读取并注入，
   * 让 Agent 感知当前业务上下文。
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
      sendAgentHttpError(res, typedAgentError('unknown', {
        title: '消息不能为空',
        message: '请输入内容后再发送。',
        canRetry: false,
      }), 400);
      return;
    }
    if (!body.projectId || !body.sessionId) {
      sendAgentHttpError(res, typedAgentError('unknown', {
        title: '会话信息不完整',
        message: '当前请求缺少项目或会话标识，请重新打开这个 Agent 会话后再试。',
        canRetry: false,
      }), 400);
      return;
    }
    if (body.permissionMode !== undefined && !['readonly', 'review', 'yolo'].includes(body.permissionMode)) {
      sendAgentHttpError(res, typedAgentError('unknown', {
        title: '权限模式无效',
        message: '请选择只读、审查或自动模式后重试。',
        canRetry: false,
      }), 400);
      return;
    }

    // 2. 获取渠道配置：优先用显式传入的 channelId，否则回退到默认 agent 渠道
    const channel = body.channelId
      ? await getChannelById(body.channelId)
      : await findDefaultAgentChannel();
    if (!channel) {
      const hint = body.channelId
        ? `渠道不存在: ${body.channelId}`
        : '没有已启用的 Agent 兼容渠道，请先在渠道设置中配置一个 Anthropic 兼容渠道';
      sendAgentHttpError(res, typedAgentError('unknown', {
        title: '还不能开始对话',
        message: hint,
        canRetry: false,
        action: 'open_settings',
      }), 400);
      return;
    }

    // 3. 确定项目目录和存储名称
    //    - 如果前端传了 projectId，用 findProjectDir 解析实际项目子目录
    //    - 不传则回退到 VAULTS_DIR 根（单项目兼容模式）
    //    - 存储名用目录的 basename（如 "PRJ_001_示例研究项目"），和文件系统一致
    const found = await findProjectDir(body.projectId);
    if (!found) {
      sendAgentHttpError(res, typedAgentError('unknown', {
        title: '项目不存在',
        message: '当前项目目录已不存在或无法访问，请返回项目列表后重新选择。',
        canRetry: false,
      }), 404);
      return;
    }
    const projectDir = found;
    let projectName = path.basename(projectDir);
    console.log(`[Pi-chat] 项目目录: ${projectDir}`);

    // 过滤文件系统非法字符，防止 mkdirSync 抛异常
    projectName = projectName.replace(/[<>:"/\\|?*]/g, '_').replace(/\.\./g, '_');

    // 确保 C 盘项目数据目录已初始化，config.json 记录 D 盘项目路径
    // 注意：不再用 projectName !== "default" 守卫，因为即使没有传 projectId，
    // pi-runtime 的 mkdirSync 会递归创建 projects/default/sessions/，
    // 必须确保 config.json 被写入。
    ensureProjectDir(projectName, projectDir);

    const currentProject = (await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT))
      .find((project) => project.projectId === projectName || project.projectId === body.projectId);
    const selectedFlowIds = new Set((Array.isArray(body.contextItems) ? body.contextItems : [])
      .filter((item): item is AIContextItem => Boolean(item) && item.type === 'flow' && typeof item.id === 'string')
      .map((item) => item.id));
    const authorizedFiles = currentProject?.flows
      .filter((flow) => selectedFlowIds.has(flow.flowId))
      .flatMap((flow) => flow.links.map((link) => link.path)) ?? [];

    // 4. 固定产品规则与本轮实时上下文分层构建。
    const systemPrompt = await buildAgentPrompt({
      contextItems: body.contextItems,
      projectId: body.projectId,
      projectStorageId: projectName,
      projectDir,
      sessionId: body.sessionId,
      dataDir: CONFIG.DATA_DIR,
    });

    // 5. 转换为 AgentRuntimeConfig（携带 systemPrompt + 自定义业务工具 + 权限模式）
    let agentConfig;
    try {
      agentConfig = channelToAgentRuntimeConfig(channel, {
        systemPrompt,
        customTools: createContourCustomTools(currentProject?.projectId ?? projectName),
        authorizedFiles,
        permissionMode: body.permissionMode,
        sessionId: body.sessionId,
        dataDir: CONFIG.DATA_DIR,
        projectDir,
        projectId: projectName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendAgentHttpError(res, typedAgentError('unknown', {
        title: '渠道配置有误',
        message: `请在设置中检查当前 Agent 渠道：${msg}`,
        canRetry: false,
        action: 'open_settings',
      }), 400);
      return;
    }

    // 6. 通过 PiRuntime 初始化并发送消息
    runtime = new PiRuntime();
    await runtime.init(agentConfig);

    // 7. 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 8. 客户端断开或超时时中止 Agent，避免浪费 API 配额
    let aborted = false;
    const onClose = () => { aborted = true; runtime?.abort(); };
    req.on('close', onClose);
    const timeout = setTimeout(() => { aborted = true; runtime?.abort(); }, 10 * 60 * 1000);

    try {
      // 9. 消费 PiRuntime.prompt() 事件流 → SSE 输出
      let streamFailed = false;
      for await (const event of runtime.prompt(body.message)) {
        if (aborted) break;
        if (event.type === 'error') streamFailed = true;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      if (!aborted && !streamFailed) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }
    } finally {
      clearTimeout(timeout);
      req.off('close', onClose);
    }
  } catch (error) {
    const payload = classifyAgentError(error);
    console.error(`[Pi-chat] ${payload.code}: ${payload.message}`);
    if (!res.headersSent) {
      sendAgentHttpError(res, error);
    } else {
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', error: payload })}\n\n`);
      } catch {
        // res.write 失败则静默
      }
    }
  } finally {
    // 10. 释放 PiRuntime 资源
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
