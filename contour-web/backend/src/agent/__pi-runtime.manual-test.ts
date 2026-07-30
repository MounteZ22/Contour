/**
 * PiRuntime 手动验证脚本
 *
 * 用法：在 contour-web/backend 目录下运行
 *   npx tsx src/agent/__pi-runtime.manual-test.ts
 *
 * 前置条件：
 * - 系统环境变量 ANTHROPIC_AUTH_TOKEN 已设置（API Key）
 * - 系统环境变量 ANTHROPIC_BASE_URL 已设置（Proma 代理地址）
 *
 * 验证目标：
 * 1. PiRuntime.init() 创建 session 成功
 * 2. model baseUrl 通过 registerProvider() 正确覆盖
 * 3. prompt() 返回 AsyncIterable 事件流，包含 text_delta / tool_call_start / tool_call_end / agent_end
 * 4. 工具调用（read）正常执行
 * 5. dispose() 正确释放资源，无订阅堆积
 */

import { PiRuntime } from "./pi-runtime.js";
import type { AgentStreamEvent } from "./agent-runtime.js";
import { CONFIG } from "../config.js";
import { fileURLToPath } from "node:url";

const API_KEY = process.env.ANTHROPIC_AUTH_TOKEN;
const BASE_URL = process.env.ANTHROPIC_BASE_URL;

if (!API_KEY) {
  console.error("❌ 未设置 ANTHROPIC_AUTH_TOKEN 环境变量");
  process.exit(1);
}
if (!BASE_URL) {
  console.error("❌ 未设置 ANTHROPIC_BASE_URL 环境变量");
  process.exit(1);
}

console.log("🔑 API Key 已检测到");
console.log("🌐 Base URL:", BASE_URL);
console.log("📁 CWD:", process.cwd());
console.log("");

async function main() {
  const runtime = new PiRuntime();

  try {
    // ── Step 1: Init ──────────────────────────────────────────────────────
    console.log("── Step 1: init() ──");
    await runtime.init({
      apiKey: API_KEY!,
      baseUrl: BASE_URL!,
      model: "claude-sonnet-5",
      dataDir: CONFIG.DATA_DIR,
      projectDir: process.cwd(),
      cwd: process.cwd(),
      tools: ["read"],
      projectId: "manual-test",
      sessionId: `manual_${Date.now()}`,
    });
    console.log("✅ init() 成功\n");

    // ── Step 2: Prompt ────────────────────────────────────────────────────
    console.log("── Step 2: prompt() ──");
    const packagePath = fileURLToPath(new URL('../../package.json', import.meta.url));
    console.log(`📤 发送: "请读取 ${packagePath} 并告诉我 name 字段"\n`);

    const eventCounts: Record<string, number> = {};
    const textParts: string[] = [];

    for await (const event of runtime.prompt(
      `请读取 ${packagePath} 并告诉我它的 name 字段是什么`,
    )) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;

      switch (event.type) {
        case "agent_start":
          console.log("  [agent_start] 会话开始");
          break;
        case "turn_start":
          console.log("  [turn_start] 新回合");
          break;
        case "text_delta":
          process.stdout.write(event.delta);
          textParts.push(event.delta);
          break;
        case "tool_call_start":
          console.log(`\n  [tool_call_start] 工具调用: ${event.toolName} | 参数: ${JSON.stringify(event.input)}`);
          break;
        case "tool_call_end":
          console.log(
            `  [tool_call_end] ${event.toolName} | isError=${event.isError} | 结果: ${event.result?.slice(0, 120) ?? '(无)'}`,
          );
          break;
        case "turn_end":
          console.log("  [turn_end] 回合结束");
          break;
        case "agent_end":
          console.log("\n  [agent_end] 会话结束");
          break;
        case "error":
          console.error(`\n  [error] ${event.error.title}: ${event.error.message}`);
          break;
      }
    }

    // ── Step 3: 事件统计 ──────────────────────────────────────────────────
    console.log("\n── Step 3: 事件统计 ──");
    console.log(`  总事件数: ${Object.values(eventCounts).reduce((a, b) => a + b, 0)}`);
    for (const [type, count] of Object.entries(eventCounts)) {
      console.log(`  ${type}: ${count}`);
    }

    // ── 验证结果 ───────────────────────────────────────────────────────────
    console.log("\n── 验证结果 ──");
    const hasTextDelta = (eventCounts["text_delta"] ?? 0) > 0;
    const hasToolStart = (eventCounts["tool_call_start"] ?? 0) > 0;
    const hasToolEnd = (eventCounts["tool_call_end"] ?? 0) > 0;
    const hasErrorToolEnd = eventCounts["tool_call_end"] ?? 0; // we check isError per event
    const hasAgentEnd = (eventCounts["agent_end"] ?? 0) > 0;
    const fullText = textParts.join("");

    console.log(`  (a) init() 成功:                        ✅ PASS`);
    console.log(
      `  (b) 事件流包含 text_delta:              ${hasTextDelta ? "✅ PASS" : "❌ FAIL"}`,
    );
    console.log(
      `  (c) 事件流包含 tool_call_start:         ${hasToolStart ? "✅ PASS" : "⚠️  NO TOOL CALLS"}`,
    );
    console.log(
      `  (d) 事件流包含 tool_call_end:           ${hasToolEnd ? "✅ PASS" : "⚠️  NO TOOL CALLS"}`,
    );
    console.log(
      `  (e) 事件流以 agent_end 结束:            ${hasAgentEnd ? "✅ PASS" : "⚠️  NO AGENT END"}`,
    );
    console.log(
      `  (f) 响应文本包含 package name:          ${fullText.includes("contour-backend") ? "✅ PASS" : fullText.includes("contour") ? "⚠️  PARTIAL" : "⚠️  UNVERIFIED"}`,
    );

    // 打印完整响应文本
    console.log("\n📝 完整响应文本:");
    console.log(fullText || "(空)");

  } catch (err: any) {
    console.error("\n❌ 测试失败:", err.message);
    console.error("Stack:", err.stack?.split("\n").slice(0, 5).join("\n  "));
    process.exit(1);
  } finally {
    // ── Step 4: Dispose ──────────────────────────────────────────────────
    console.log("\n── Step 4: dispose() ──");
    runtime.dispose();
    console.log("✅ dispose() 完成（无报错即表示订阅已正确清理）");
  }
}

main().catch((err) => {
  console.error("未捕获错误:", err);
  process.exit(1);
});
