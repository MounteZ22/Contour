import { describe, expect, it } from "vitest";
import { classifyAgentError, typedAgentError } from "../typed-error.js";

describe("Agent 错误分类", () => {
  it.each([
    [Object.assign(new Error("invalid x-api-key"), { status: 401 }), "invalid_api_key", false, "open_settings"],
    [Object.assign(new Error("Too many requests"), { statusCode: 429 }), "rate_limited", true, undefined],
    [new Error("context length exceeded: too many tokens"), "prompt_too_long", false, undefined],
    [Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } }), "network_error", true, undefined],
    [Object.assign(new Error("service unavailable"), { status: 503 }), "service_error", true, undefined],
    [new Error("Model claude-x not found"), "invalid_model", false, "open_settings"],
    [Object.assign(new Error("The operation was aborted"), { name: "AbortError" }), "aborted", true, undefined],
    [new Error("something unusual happened"), "unknown", true, undefined],
  ])("能把供应商错误映射为结构化的 %s", (source, expectedCode, canRetry, action) => {
    const result = classifyAgentError(source);
    expect(result).toMatchObject({ code: expectedCode, canRetry });
    expect(result.action).toBe(action);
    expect(result.title).not.toBe("");
    expect(result.message).not.toBe("");
  });

  it("保留业务层明确指定的错误说明", () => {
    const result = classifyAgentError(typedAgentError("unknown", {
      title: "还不能开始对话",
      message: "请先配置渠道。",
      canRetry: false,
      action: "open_settings",
    }));
    expect(result).toMatchObject({ code: "unknown", title: "还不能开始对话", message: "请先配置渠道。", canRetry: false, action: "open_settings" });
  });
});
