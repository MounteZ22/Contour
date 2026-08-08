import { afterEach, describe, expect, it, vi } from "vitest";
import { addProjectMcpServer, fetchProjectPlugins, setProjectSkillEnabled } from "./projectPlugins";

afterEach(() => vi.restoreAllMocks());

describe("项目插件 API 调用", () => {
  it("Given 读取项目插件, When 发起请求, Then 路径使用编码后的项目 ID", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { version: 1, mcpServers: [], skillDirectories: [] },
    }), { status: 200 }));

    await expect(fetchProjectPlugins("研究 项目")).resolves.toMatchObject({ version: 1 });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/%E7%A0%94%E7%A9%B6%20%E9%A1%B9%E7%9B%AE/plugins");
  });

  it("Given 添加 MCP, When 提交声明, Then 仅发送固定配置而非运行请求", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { version: 1, mcpServers: [], skillDirectories: [] },
    }), { status: 200 }));

    await addProjectMcpServer("P01", { name: "本地工具", command: "C:\\server.exe", args: ["--read-only"], env: { MODE: "safe" }, toolLimit: 3 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/projects/P01/plugins/mcp");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ name: "本地工具", command: "C:\\server.exe", args: ["--read-only"], env: { MODE: "safe" }, toolLimit: 3 });
  });

  it("Given 技能目录, When 切换开关, Then 使用 PATCH 而非调用任何插件", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { version: 1, mcpServers: [], skillDirectories: [] },
    }), { status: 200 }));

    await setProjectSkillEnabled("P01", "skill-id", true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/projects/P01/plugins/skills/skill-id");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ enabled: true });
  });
});
