import { describe, expect, it, vi } from "vitest";
import { createPermissionExtensionFactory } from "../permission-extension.js";

describe("外部 MCP 权限确认", () => {
  it("Given yolo 模式的外部 MCP 工具, When Agent 调用, Then 仍必须等待一次用户确认", async () => {
    let handler: ((event: { toolName: string; input: unknown }) => Promise<unknown> | unknown) | undefined;
    const pi = { on: vi.fn((_event: string, callback: typeof handler) => { handler = callback; }) };
    const requester = vi.fn().mockResolvedValue({ action: "allow", remember: true });

    createPermissionExtensionFactory("yolo", "D:\\data", "P01", () => requester, ["mcp_1_1_lookup"])(pi);
    const result = await handler?.({ toolName: "mcp_1_1_lookup", input: { query: "资料" } });

    expect(requester).toHaveBeenCalledWith(expect.objectContaining({ toolName: "mcp_1_1_lookup" }));
    expect(result).toBeUndefined();
  });

  it("Given yolo 模式的 Contour 内置写工具, When Agent 调用, Then 保持原有不拦截语义", async () => {
    const pi = { on: vi.fn() };
    createPermissionExtensionFactory("yolo", "D:\\data", "P01", () => null, [])(pi);
    expect(pi.on).not.toHaveBeenCalled();
  });
});
