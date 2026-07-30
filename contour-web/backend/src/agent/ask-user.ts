/**
 * ask-user — AskUserQuestion 工具的实例级事件桥接
 *
 * 每个 PiRuntime 拥有一个 AskUserRequestManager。管理器只保存该运行时
 * 当前 prompt 创建的请求，避免并发会话之间串流或相互取消。
 */

import type { AgentStreamEvent, AskUserQuestionItem, AskUserResponse } from "./agent-runtime.js";

/** 5 分钟超时自动清理，与前端交互等待窗口保持一致。 */
const ASK_USER_TIMEOUT_MS = 5 * 60 * 1000;

type AskUserEventEmitter = (event: AgentStreamEvent) => void;

interface PendingAskUserRequest {
  generation: number;
  resolve: (response: AskUserResponse) => void;
  reject: (err: Error) => void;
}

/**
 * 供 HTTP 路由维护 requestId 路由索引的生命周期回调。
 *
 * 索引不拥有 pending Promise；请求和取消边界始终由实例管理器负责。
 */
export interface AskUserRequestLifecycle {
  onCreated?: (requestId: string, manager: AskUserRequestManager) => void;
  onSettled?: (requestId: string, manager: AskUserRequestManager) => void;
}

/** AskUser 请求管理器：一个实例只服务一个 PiRuntime。 */
export class AskUserRequestManager {
  private emitter: AskUserEventEmitter | null = null;
  private activeGeneration: number | null = null;
  private nextGeneration = 0;
  private readonly pendingRequests = new Map<string, PendingAskUserRequest>();

  constructor(private readonly lifecycle: AskUserRequestLifecycle = {}) {}

  /** 在 prompt 开始时创建独立 generation，并绑定该轮的 SSE 推送函数。 */
  beginPrompt(emitter: AskUserEventEmitter): number {
    const generation = ++this.nextGeneration;
    this.activeGeneration = generation;
    this.emitter = emitter;
    return generation;
  }

  /**
   * 仅结束指定 generation 的 AskUser 通道和请求。
   *
   * 旧 prompt 的 Promise 可能在新 prompt 已启动后才 settle，因此不能清理
   * 当前 generation 的 emitter 或请求。
   */
  endPrompt(generation: number, reason: string = "会话已终止"): void {
    if (this.activeGeneration === generation) {
      this.activeGeneration = null;
      this.emitter = null;
    }
    for (const pending of [...this.pendingRequests.values()]) {
      if (pending.generation === generation) pending.reject(new Error(reason));
    }
  }

  /** 创建请求、推送 SSE 事件，并等待当前用户的回答。 */
  request(questions: AskUserQuestionItem[]): Promise<AskUserResponse> {
    const generation = this.activeGeneration;
    const emitter = this.emitter;
    if (generation === null || !emitter) {
      return Promise.reject(new Error("AskUser 事件通道未就绪"));
    }

    const requestId = crypto.randomUUID();
    return new Promise<AskUserResponse>((resolve, reject) => {
      let settled = false;
      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        this.lifecycle.onSettled?.(requestId, this);
        callback();
      };
      const timeout = setTimeout(() => {
        settle(() => reject(new Error("等待用户回答超时")));
      }, ASK_USER_TIMEOUT_MS);

      this.pendingRequests.set(requestId, {
        generation,
        resolve: (response) => settle(() => resolve(response)),
        reject: (error) => settle(() => reject(error)),
      });
      this.lifecycle.onCreated?.(requestId, this);

      // 保留局部引用，避免 prompt 清理后将事件错误推向下一轮通道。
      emitter({ type: "ask_user", requestId, questions });
    });
  }

  /** 仅解析属于当前管理器的请求。 */
  resolve(requestId: string, answers: AskUserResponse["answers"]): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return false;
    pending.resolve({ answers });
    return true;
  }

}
