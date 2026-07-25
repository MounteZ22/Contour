/**
 * permission-extension — 权限拦截 extensionFactory（完整确认 UI 链路）
 *
 * 通过 Pi SDK 的 extensionFactories 机制挂 tool_call 钩子，在工具真正执行前
 * 拦截写操作，等待用户确认后放行或拒绝。
 *
 * 架构要点：
 * - 规则持久化：放行的工具可"记住"（persist 规则到 dataDir/projects/{name}/permission-rules.json）
 * - 规则优先：匹配规则的请求直接放行/拒绝，不弹确认框
 * - 实例级状态：pendingRequests Map 在 SSE 流与 POST /api/ai/permission-response
 *   之间桥接，PiRuntime 在 prompt() 中负责注入 requester
 * - 状态清理：prompt 结束或出错时通过 cleanup 回调清理 requester
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { AgentRuntimeConfig } from "./agent-runtime.js";
import { auditLog } from "../services/audit-log.js";

// ── 类型 ───────────────────────────────────────────────────────────────────

/** 前端显示的权限请求信息 */
export interface PermissionRequestInfo {
  requestId: string;
  toolName: string;
  input: unknown;
  reason: string;
}

/** 用户返回的决策 */
export interface PermissionResponse {
  action: "allow" | "deny";
  remember: boolean;
}

/** 持久化到本地的规则 */
export interface PermissionRule {
  toolName: string;
  /** 输入匹配模式（简单字符串前缀匹配） */
  pattern: string;
  action: "allow" | "deny";
}

// ── 写入/执行类工具 ────────────────────────────────────────────────────────

// bash 正常情况下已被 PiRuntime 移除；这里仍保留拦截作为纵深防护。
const WRITE_TOOLS = new Set(["write", "edit", "bash"]);

// ── 模块级 pending 请求 Map ─────────────────────────────────────────────────
//
// 桥接 SSE 流（permission-extension 写、SSE 消费侧读）和 POST response 路由
// （前端回传结果后 resolve Promise）。
// 设计上同时只有一个 pending request（Agent 单线程），
// 但 Map 结构支持并发场景，便于未来扩展。

interface PendingRequest {
  resolve: (resp: PermissionResponse) => void;
  reject: (err: Error) => void;
  toolName: string;
  input: unknown;
  createdAt: number;
}

const pendingRequests = new Map<string, PendingRequest>();

// ── 规则持久化 ─────────────────────────────────────────────────────────────

/**
 * 规则文件的绝对路径：dataDir/projects/{projectId}/permission-rules.json
 */
function rulesFilePath(dataDir: string, projectId: string): string {
  return path.join(dataDir, "projects", projectId, "permission-rules.json");
}

/**
 * 加载规则文件
 */
function loadRules(dataDir: string, projectId: string): PermissionRule[] {
  try {
    const filePath = rulesFilePath(dataDir, projectId);
    if (!existsSync(filePath)) return [];
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * 追加一条规则（原子写入）
 */
function persistRule(dataDir: string, projectId: string, rule: PermissionRule): void {
  try {
    const filePath = rulesFilePath(dataDir, projectId);
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const rules = loadRules(dataDir, projectId);
    rules.push(rule);
    // 原子写入：先写临时文件再 rename
    const tempPath = path.join(dir, `.permission-rules-${crypto.randomUUID()}.tmp`);
    try {
      writeFileSync(tempPath, JSON.stringify(rules, null, 2), "utf-8");
      renameSync(tempPath, filePath);
      // 审计日志：记录权限规则的持久化
      auditLog('permissionRulePersisted', {
        projectId,
        toolName: rule.toolName,
        action: rule.action,
        patternLength: rule.pattern.length,
      });
    } catch (err) {
      rmSync(tempPath, { force: true });
      throw err;
    }
  } catch (err) {
    console.warn("[PermissionExtension] 持久化规则失败:", err);
  }
}

/**
 * 规则匹配：对已知路径类工具做语义化匹配，避免字符串前缀误匹配。
 *
 * - toolName 精确匹配
 * - 对 write / edit 工具，解析 input 中的 path 字段做目录前缀匹配
 * - 对其他工具，回退到 pattern 为输入字符串的前缀匹配
 */
function matchRule(
  rules: PermissionRule[],
  toolName: string,
  input: unknown,
): PermissionRule | undefined {
  const inputStr = typeof input === "string" ? input : JSON.stringify(input ?? "");

  // 对 write/edit 工具做 path 字段语义化匹配
  if ((toolName === "write" || toolName === "edit") && typeof input === "object" && input !== null) {
    const inputObj = input as Record<string, unknown>;
    const filePath = typeof inputObj.path === "string" ? inputObj.path : null;
    if (filePath) {
      const normalizedPath = filePath.replace(/\\/g, "/");
      return rules.find((r) => {
        if (r.toolName !== toolName) return false;
        // 尝试解析规则 pattern 为路径，做目录前缀匹配
        try {
          const rulePath = JSON.parse(r.pattern) as unknown;
          if (typeof rulePath === "object" && rulePath !== null && "path" in rulePath) {
            const ruleFilePath = String((rulePath as Record<string, unknown>).path).replace(/\\/g, "/");
            return normalizedPath.startsWith(ruleFilePath) || normalizedPath === ruleFilePath;
          }
        } catch {
          // pattern 不是 JSON，回退到普通前缀匹配
        }
        const rulePattern = r.pattern.replace(/\\/g, "/");
        return normalizedPath.startsWith(rulePattern) || normalizedPath === rulePattern;
      });
    }
  }

  // 对其他工具，回退到字符串前缀匹配
  return rules.find(
    (r) => r.toolName === toolName && inputStr.startsWith(r.pattern),
  );
}

// ── 公共 API ───────────────────────────────────────────────────────────────

/**
 * 创建一个 pending 权限请求，返回 requestId 和 Promise
 *
 * 调用方（tool_call 钩子）await promise 直到用户决策。
 */
export function createPermissionRequest(
  toolName: string,
  input: unknown,
  reason: string,
): { requestId: string; promise: Promise<PermissionResponse>; abort: () => void } {
  const requestId = crypto.randomUUID();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  /** 清理 Map 条目和超时定时器（幂等） */
  const cleanup = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    pendingRequests.delete(requestId);
  };

  const promise = new Promise<PermissionResponse>((resolve, reject) => {
    pendingRequests.set(requestId, {
      resolve: (resp: PermissionResponse) => {
        cleanup();
        resolve(resp);
      },
      reject: (err: Error) => {
        cleanup();
        reject(err);
      },
      toolName,
      input,
      createdAt: Date.now(),
    });

    // 自清理超时：5 分钟后自动拒绝并清理 Map 条目
    timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      timeoutId = null;
      reject(new Error("权限请求超时"));
    }, 5 * 60 * 1000);
  });

  return { requestId, promise, abort: cleanup };
}

/**
 * 完成一个 pending 权限请求（被 POST /api/ai/permission-response 调用）
 *
 * @returns 找到并 resolve 返回 true；requestId 不存在或已超时返回 false
 */
export function resolvePermissionRequest(
  requestId: string,
  action: "allow" | "deny",
  remember: boolean,
): boolean {
  const pending = pendingRequests.get(requestId);
  if (!pending) return false;
  pending.resolve({ action, remember });
  pendingRequests.delete(requestId);
  return true;
}

/**
 * 拒绝所有 pending 请求（dispose/abort 时清理）
 */
export function rejectAllPendingRequests(reason: string = "会话已终止"): void {
  for (const [id, pending] of pendingRequests) {
    pending.reject(new Error(reason));
    pendingRequests.delete(id);
  }
}

// ── 实例级 requester 类型 ─────────────────────────────────────────────────

/**
 * tool_call 钩子在拦截写操作后，调用此函数请求用户确认。
 *
 * PiRuntime 在调用 session.prompt() 前设置实例属性 activeRequester，
 * 在 prompt 结束后清除。函数内部通过 pushEvent 发出
 * permission_request 事件到事件流，并返回一个 Promise。
 */
export type PermissionRequesterFn = (
  info: PermissionRequestInfo,
) => Promise<PermissionResponse>;

// ── ExtensionFactory ──────────────────────────────────────────────────────

/**
 * 创建权限拦截 extensionFactory
 *
 * @param permissionMode 权限模式。仅 "review" 时挂钩子
 * @param dataDir 应用数据目录（~/.contour 或 ~/.contour-dev）
 * @param projectId 项目 ID（如 "PRJ_001"），用于隔离规则文件路径
 * @returns Pi SDK 的 ExtensionFactory 函数
 */
export function createPermissionExtensionFactory(
  permissionMode: NonNullable<AgentRuntimeConfig["permissionMode"]>,
  dataDir: string,
  projectId: string,
  getRequester: () => PermissionRequesterFn | null,
): (pi: any) => void {
  return (pi: any) => {
    // readonly / yolo 不挂钩子
    if (permissionMode !== "review") return;

    pi.on("tool_call", (event: any, _ctx: any) => {
      // 只放行非写工具
      if (!WRITE_TOOLS.has(event.toolName)) return;

      // ── 1. 规则匹配 ─────────────────────────────────────────────────────
      const rules = loadRules(dataDir, projectId);
      const matched = matchRule(rules, event.toolName, event.input);
      if (matched) {
        if (matched.action === "allow") {
          return; // 放行（undefined = 不 block）
        }
        return {
          block: true,
          reason: `审查模式规则已拒绝 ${event.toolName} 的类似操作`,
        };
      }

      // ── 2. 无命中规则 → 请求用户确认 ──────────────────────────────────
      const requester = getRequester();
      if (!requester) {
        // 安全回退：无 requester 时直接拒绝
        return {
          block: true,
          reason: `审查模式需用户确认 ${event.toolName} 操作，但确认链路未就绪`,
        };
      }

      // hook 可以是 async，Pi SDK await 此返回值（agent-loop.js:386）
      //
      // 调用 getRequester()（由 PiRuntime.prompt() 注入）：requester 内部
      // 通过 createPermissionRequest 生成 requestId + Promise，push SSE
      // permission_request 事件到事件流，返回 Promise。这里 await 用户决策。
      // 超时保护由 createPermissionRequest 内部的 5 分钟 setTimeout 提供，
      // 无需在此处重复 Promise.race，避免孤儿定时器。
      return (async () => {
        try {
          const result = await requester({
            requestId: "", // requester 内部生成真实 requestId
            toolName: event.toolName,
            input: event.input,
            reason: `Agent 请求执行 ${event.toolName}`,
          });

          // 保存规则（如果用户要求记住）
          if (result.remember) {
            const inputStr =
              typeof event.input === "string"
                ? event.input
                : JSON.stringify(event.input ?? "");
            persistRule(dataDir, projectId, {
              toolName: event.toolName,
              pattern: inputStr.slice(0, 200),
              action: result.action,
            });
          }

          if (result.action === "deny") {
            return {
              block: true,
              reason: `用户拒绝了 ${event.toolName} 操作`,
            };
          }
          // allow → 放行
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "权限请求异常";
          return { block: true, reason: msg };
        }
      })();
    });
  };
}
