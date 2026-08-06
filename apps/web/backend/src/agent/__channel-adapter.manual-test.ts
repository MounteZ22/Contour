/**
 * channel-adapter 手动验证脚本
 *
 * 用法：在 contour-web/backend 目录下运行
 *   npx tsx src/agent/__channel-adapter.manual-test.ts
 *
 * 验证目标：
 * 1. channelToAgentRuntimeConfig() 正确转换 Channel → AgentRuntimeConfig
 * 2. 非兼容 provider 抛出明确错误
 * 3. 无 enabled 模型时抛出明确错误
 * 4. overrides 正确覆盖默认值
 * 5. baseUrl 规范化逻辑正确（去尾部斜杠 + 去 /v\d+ 和 /messages 后缀，不追加 /v1）
 */

import { channelToAgentRuntimeConfig } from "./channel-adapter.js";
import type { Channel, ChannelModel } from "../types.js";

// ── 构造测试数据 ──────────────────────────────────────────────────────────────

/** 构造一个最小可用的 Channel 对象 */
function makeChannel(overrides?: Partial<Channel>): Channel {
  return {
    id: "test-channel-1",
    name: "测试渠道",
    provider: "anthropic",
    baseUrl: "https://api.anthropic.com",
    apiKey: "sk-ant-test-key-12345",
    models: [
      { id: "claude-sonnet-5", name: "Claude Sonnet 5", enabled: true },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", enabled: false },
    ],
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}${detail ? ` (${detail})` : ""}`);
    failed++;
  }
}

function assertThrows(fn: () => unknown, expectedMsg: string, label: string): void {
  try {
    fn();
    console.log(`  ❌ FAIL: ${label} (未抛出异常)`);
    failed++;
  } catch (err: any) {
    if (err.message.includes(expectedMsg)) {
      console.log(`  ✅ PASS: ${label}`);
      passed++;
    } else {
      console.log(`  ❌ FAIL: ${label} (消息不匹配: ${err.message.slice(0, 80)})`);
      failed++;
    }
  }
}

// ── 测试用例 ──────────────────────────────────────────────────────────────────

function runTests() {
  console.log("=" .repeat(60));
  console.log("channel-adapter 验证测试");
  console.log("=".repeat(60));
  console.log("");

  // ── 测试组 1: 基本转换 ──────────────────────────────────────────────────
  console.log("── 1. 基本转换 ──");

  const channel = makeChannel();
  const config = channelToAgentRuntimeConfig(channel);

  console.log("  转换结果:");
  console.log(`    apiKey:  ${config.apiKey.slice(0, 10)}...`);
  console.log(`    baseUrl: ${config.baseUrl}`);
  console.log(`    model:   ${config.model}`);
  console.log(`    cwd:     ${config.cwd}`);
  console.log(`    tools:   ${JSON.stringify(config.tools)}`);
  console.log("");

  assert(config.apiKey === "sk-ant-test-key-12345", "apiKey 正确传递");
  assert(config.baseUrl === "https://api.anthropic.com", "anthropic baseUrl 不做版本路径追加（Pi SDK 自行处理）");
  assert(config.model === "claude-sonnet-5", "默认模型为第一个 enabled 模型");
  assert(typeof config.cwd === "string" && config.cwd.length > 0, "cwd 有默认值");
  assert(
    JSON.stringify(config.tools) === JSON.stringify(["read"]),
    "tools 默认为 [read]",
  );

  // ── 测试组 2: overrides 覆盖 ────────────────────────────────────────────
  console.log("── 2. overrides 覆盖 ──");

  const config2 = channelToAgentRuntimeConfig(channel, {
    model: "claude-opus-4-8",
    cwd: "/custom/path",
    tools: ["read", "bash"],
  });

  assert(config2.model === "claude-opus-4-8", "overrides.model 覆盖默认模型");
  assert(config2.cwd === "/custom/path", "overrides.cwd 覆盖默认 cwd");
  assert(
    JSON.stringify(config2.tools) === JSON.stringify(["read", "bash"]),
    "overrides.tools 覆盖默认 tools",
  );

  // ── 测试组 3: 非兼容 provider ───────────────────────────────────────────
  console.log("── 3. 非兼容 provider 报错 ──");

  assertThrows(
    () =>
      channelToAgentRuntimeConfig(
        makeChannel({ provider: "custom", name: "自定义渠道" }),
      ),
    "不支持 Agent 模式",
    "custom provider 抛出错误",
  );

  // ── 测试组 4: 无 enabled 模型 ───────────────────────────────────────────
  console.log("── 4. 无 enabled 模型报错 ──");

  assertThrows(
    () =>
      channelToAgentRuntimeConfig(
        makeChannel({
          models: [
            { id: "m1", name: "M1", enabled: false },
            { id: "m2", name: "M2", enabled: false },
          ],
        }),
      ),
    "没有已启用的模型",
    "全部 disabled 时抛出错误",
  );

  // ── 测试组 5: 空模型列表 ────────────────────────────────────────────────
  console.log("── 5. 空模型列表报错 ──");

  assertThrows(
    () =>
      channelToAgentRuntimeConfig(
        makeChannel({ models: [] }),
      ),
    "未配置任何模型",
    "空模型列表时抛出错误",
  );

  // ── 测试组 6: deepseek provider 的 baseUrl 规范化 ───────────────────────
  console.log("── 6. deepseek baseUrl 规范化 ──");

  const dsChannel = makeChannel({
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/anthropic/",
    models: [{ id: "deepseek-chat", name: "DeepSeek Chat", enabled: true }],
  });
  const dsConfig = channelToAgentRuntimeConfig(dsChannel);

  assert(
    dsConfig.baseUrl === "https://api.deepseek.com/anthropic",
    "deepseek baseUrl 仅去除尾部斜杠（不追加 /v1）",
  );

  // ── 测试组 7: anthropic baseUrl 带 /messages 后缀 ───────────────────────
  console.log("── 7. anthropic baseUrl 带 /messages ──");

  const anthroChannel = makeChannel({
    provider: "anthropic",
    baseUrl: "https://api.anthropic.com/v1/messages",
    models: [{ id: "claude-sonnet-5", name: "Claude Sonnet 5", enabled: true }],
  });
  const anthroConfig = channelToAgentRuntimeConfig(anthroChannel);

  assert(
    anthroConfig.baseUrl === "https://api.anthropic.com",
    "anthropic baseUrl 去除 /v1/messages 后缀（Pi SDK 自行处理版本路径）",
  );

  // ── 测试组 8: kimi-api provider ─────────────────────────────────────────
  console.log("── 8. kimi-api 转换 ──");

  const kimiChannel = makeChannel({
    provider: "kimi-api",
    baseUrl: "https://api.moonshot.cn/anthropic",
    models: [{ id: "kimi-latest", name: "Kimi Latest", enabled: true }],
  });
  const kimiConfig = channelToAgentRuntimeConfig(kimiChannel);

  assert(kimiConfig.model === "kimi-latest", "kimi-api 模型正确");
  assert(
    kimiConfig.baseUrl === "https://api.moonshot.cn/anthropic",
    "kimi-api baseUrl 不做版本路径追加",
  );

  // ── 测试组 9: baseUrl 为空时回退到 PROVIDER_DEFAULT_URLS ────────────────
  console.log("── 9. baseUrl 为空时回退 ──");

  const noUrlChannel = makeChannel({
    provider: "deepseek",
    baseUrl: "",
    models: [{ id: "deepseek-chat", name: "DeepSeek Chat", enabled: true }],
  });
  const noUrlConfig = channelToAgentRuntimeConfig(noUrlChannel);

  assert(
    noUrlConfig.baseUrl === "https://api.deepseek.com/anthropic",
    "空 baseUrl 回退到 PROVIDER_DEFAULT_URLS",
  );

  // ── 结果汇总 ─────────────────────────────────────────────────────────────
  console.log("");
  console.log("=".repeat(60));
  console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
