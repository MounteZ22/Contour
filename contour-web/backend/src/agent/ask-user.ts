/**
 * ask-user — AskUserQuestion 工具的事件桥接模块
 *
 * 当 Agent 调用 AskUserQuestion 工具时，自定义工具的 execute 函数通过本模块
 * 创建 pending 请求、推送 ask_user 事件到 SSE 流、等待前端返回用户答案。
 *
 * 架构类似 permission-extension.ts，但 AskUserQuestion 是独立的自定义工具
 * （覆盖 Pi SDK 内置同名工具），不依赖 extensionFactory 机制。
 */

import type { AgentStreamEvent, AskUserQuestionItem, AskUserResponse } from "./agent-runtime.js";

// ── 模块级 emitter（由 PiRuntime.prompt() 设置） ────────────────────────────

/** 推事件到当前 prompt 的 SSE 流 */
let askUserEventEmitter: ((event: AgentStreamEvent) => void) | null = null;

/**
 * 设置当前 prompt 的 ask_user 事件发射器。
 * PiRuntime.prompt() 在启动前调用此函数注入 pushEvent；结束时传入 null 清理。
 */
export function setAskUserEventEmitter(
  emitter: ((event: AgentStreamEvent) => void) | null,
): void {
  askUserEventEmitter = emitter;
}

// ── pending 请求管理 ─────────────────────────────────────────────────────────

interface PendingAskUserRequest {
  resolve: (response: AskUserResponse) => void;
  reject: (err: Error) => void;
  createdAt: number;
}

const pendingRequests = new Map<string, PendingAskUserRequest>();

/** 5 分钟超时自动清理 */
const ASK_USER_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 创建一个 pending AskUser 请求，触发 ask_user 事件到前端，
 * 返回一个 Promise 等待用户提交答案。
 */
export function requestAskUser(
  questions: AskUserQuestionItem[],
): Promise<AskUserResponse> {
  const requestId = crypto.randomUUID();
  const emitter = askUserEventEmitter;

  if (!emitter) {
    return Promise.reject(new Error("AskUser 事件通道未就绪"));
  }

  const promise = new Promise<AskUserResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("等待用户回答超时"));
    }, ASK_USER_TIMEOUT_MS);

    pendingRequests.set(requestId, {
      resolve: (response: AskUserResponse) => {
        clearTimeout(timeout);
        pendingRequests.delete(requestId);
        resolve(response);
      },
      reject: (err: Error) => {
        clearTimeout(timeout);
        pendingRequests.delete(requestId);
        reject(err);
      },
      createdAt: Date.now(),
    });

    // 推送 ask_user 事件到前端
    emitter({ type: "ask_user", requestId, questions } as AgentStreamEvent);
  });

  return promise;
}

/**
 * 解析用户提交的答案。
 * 由 POST /api/ai/ask-user-response 路由调用。
 */
export function resolveAskUser(
  requestId: string,
  answers: AskUserResponse["answers"],
): boolean {
  const pending = pendingRequests.get(requestId);
  if (!pending) return false;
  pending.resolve({ answers });
  return true;
}

/**
 * 拒绝所有 pending 请求（dispose/abort 时清理）。
 */
export function rejectAllAskUserRequests(reason: string = "会话已终止"): void {
  for (const [id, pending] of pendingRequests) {
    pending.reject(new Error(reason));
    pendingRequests.delete(id);
  }
}
