import { afterEach, describe, expect, it, vi } from "vitest";

const getEnabledProjectMcpServers = vi.fn();

vi.mock("../../services/project-plugin-config.js", () => ({
  getEnabledProjectMcpServers,
}));

const { createProjectMcpTools } = await import("../project-mcp-tools.js");

function fakeClient() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        { name: "lookup", description: "x".repeat(2_100), inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
        { name: "ignored-by-limit", inputSchema: { type: "object" } },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("项目 MCP stdio 桥接", () => {
  it("Given readonly 会话, When 初始化桥接, Then 不读取配置、不启动外部程序也不暴露工具", async () => {
    const result = await createProjectMcpTools({
      projectId: "P01", projectDir: "D:\\project", permissionMode: "readonly",
    });

    expect(getEnabledProjectMcpServers).not.toHaveBeenCalled();
    expect(result.tools).toEqual([]);
    expect(result.reviewConfirmationToolNames).toEqual([]);
  });

  it("Given 启用的本地 MCP, When review 或 yolo 初始化, Then 工具受数量和内容限制且都要求逐次确认", async () => {
    getEnabledProjectMcpServers.mockReturnValue([{
      id: "server-1", name: "本地资料", command: process.execPath, args: [], env: { MODE: "safe" }, enabled: true, toolLimit: 1,
    }]);
    vi.useFakeTimers();
    const client = fakeClient();

    const result = await createProjectMcpTools({
      projectId: "P01",
      projectDir: "D:\\project",
      permissionMode: "yolo",
      createClient: () => client,
    });

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toMatch(/^mcp_1_1_lookup$/);
    expect(result.tools[0].description.length).toBeLessThanOrEqual(2_020);
    expect(result.reviewConfirmationToolNames).toEqual([result.tools[0].name]);

    await result.tools[0].execute("call-1", { query: "论文" });
    expect(client.callTool).toHaveBeenCalledWith(
      { name: "lookup", arguments: { query: "论文" } },
      undefined,
      expect.objectContaining({ timeout: 60_000, maxTotalTimeout: 60_000 }),
    );
    await result.dispose();
    expect(client.close).toHaveBeenCalledTimes(1);
  });
});
