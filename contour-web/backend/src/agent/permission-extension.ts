/**
 * permission-extension — 权限拦截 extensionFactory
 *
 * 通过 Pi SDK 的 extensionFactories 机制挂 tool_call 钩子，在工具真正执行前
 * 拦截。用于 review 权限模式。
 *
 * 设计要点：
 * - 只依赖 Pi SDK 类型（ExtensionAPI 的 on/registerTool），不依赖 backend
 *   内部 service，符合 agent/ 模块隔离原则
 * - 钩子 handler 可以是 async（调研确认 agent-loop.js:386 await handler），
 *   未来确认 UI 实现后，这里改成 await 用户确认结果再决定 block
 * - 当前骨架版：review 模式下写工具直接 deny，返回 block + reason
 *
 * 调研依据：
 * - extensionFactories 通过 DefaultResourceLoader 注入（resource-loader.d.ts:70）
 * - pi.on("tool_call") 返回 {block:true, reason} 即阻止（agent-loop.js:386-392）
 * - extensionFactories 和 customTools 能共存（agent-session.js:1861-1867）
 */

import type { AgentRuntimeConfig } from "./agent-runtime.js";

/** 写入/执行类工具，review 模式下需拦截 */
const WRITE_TOOLS = new Set(["write", "edit", "bash"]);

/**
 * 创建权限拦截 extensionFactory
 *
 * @param permissionMode 权限模式。仅 "review" 时挂钩子；"readonly"/"yolo" 返回空工厂
 * （readonly 靠 tools 白名单限制，yolo 全放行，都不需要钩子）
 * @returns Pi SDK 的 ExtensionFactory 函数
 */
export function createPermissionExtensionFactory(
  permissionMode: NonNullable<AgentRuntimeConfig["permissionMode"]>,
): (pi: any) => void {
  return (pi: any) => {
    // readonly / yolo 不挂钩子（readonly 靠白名单，yolo 全放行）
    if (permissionMode !== "review") return;

    pi.on("tool_call", (event: any, _ctx: any) => {
      if (WRITE_TOOLS.has(event.toolName)) {
        return {
          block: true,
          reason: `审查模式下 ${event.toolName} 工具需用户确认（确认 UI 待实现，当前默认拒绝）`,
        };
      }
      // 只读工具放行
    });
  };
}
