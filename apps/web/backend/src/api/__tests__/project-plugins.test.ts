import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import request from "supertest";
import { createTestHostContext } from './test-host.js';

let testRoot!: string;
let projectsDir!: string;
let vaultsDir!: string;

vi.mock("../../config.js", async () => {
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  testRoot = join(tmpdir(), `contour-project-plugins-api-${Date.now()}`);
  projectsDir = join(testRoot, "data", "projects");
  vaultsDir = join(testRoot, "vaults");
  return {
    PROJECTS_DIR: projectsDir,
    CONFIG: { VAULTS_DIR: vaultsDir, LEGACY_VAULT: join(testRoot, "legacy") },
  };
});

await import('../../config.js');
const { createProjectPluginsRouter } = await import("../project-plugins.js");
const router = createProjectPluginsRouter(createTestHostContext({ dataDir: testRoot, projectsDir, vaultsDir, legacyVault: path.join(testRoot, "legacy") }));
const app = express();
app.use(express.json());
app.use("/api/projects", router);

const projectId = "插件项目";
const executable = process.execPath;

beforeEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(vaultsDir, projectId), { recursive: true });
});

afterAll(() => fs.rmSync(testRoot, { recursive: true, force: true }));

describe("项目插件配置 API", () => {
  it("Given 尚未保存配置, When 读取插件, Then MCP 与技能默认均为空且关闭", async () => {
    const response = await request(app).get(`/api/projects/${encodeURIComponent(projectId)}/plugins`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ version: 1, mcpServers: [], skillDirectories: [] });
  });

  it("Given 合法 MCP 声明, When 添加与启用, Then 保存固定参数并默认关闭", async () => {
    const added = await request(app).post(`/api/projects/${encodeURIComponent(projectId)}/plugins/mcp`).send({
      name: "本地测试服务",
      command: executable,
      args: ["server.mjs", "--readonly"],
      env: { MCP_MODE: "readonly" },
      toolLimit: 4,
    });

    expect(added.status).toBe(200);
    const server = added.body.data.mcpServers[0];
    expect(server.enabled).toBe(false);
    expect(server.args).toEqual(["server.mjs", "--readonly"]);
    expect(server.command).toBe(fs.realpathSync.native(executable));

    const enabled = await request(app)
      .patch(`/api/projects/${encodeURIComponent(projectId)}/plugins/mcp/${server.id}`)
      .send({ enabled: true });
    expect(enabled.status).toBe(200);
    expect(enabled.body.data.mcpServers[0].enabled).toBe(true);
  });

  it("Given 命令解释器、非绝对路径或超过预算, When 添加 MCP, Then 拒绝写入", async () => {
    const relative = await request(app).post(`/api/projects/${encodeURIComponent(projectId)}/plugins/mcp`).send({
      name: "错误服务", command: "node", toolLimit: 1,
    });
    expect(relative.status).toBe(400);
    expect(relative.body.error).toContain("绝对");

    const blockedCommand = process.platform === "win32"
      ? path.join(path.dirname(executable), "cmd.exe")
      : "/bin/sh";
    if (fs.existsSync(blockedCommand)) {
      const blocked = await request(app).post(`/api/projects/${encodeURIComponent(projectId)}/plugins/mcp`).send({
        name: "包装器", command: blockedCommand, toolLimit: 1,
      });
      expect(blocked.status).toBe(400);
      expect(blocked.body.error).toContain("解释器");
    }

    for (let index = 0; index < 3; index += 1) {
      const response = await request(app).post(`/api/projects/${encodeURIComponent(projectId)}/plugins/mcp`).send({
        name: `服务 ${index}`, command: executable, toolLimit: 6,
      });
      expect(response.status).toBe(200);
    }
    const overBudget = await request(app).post(`/api/projects/${encodeURIComponent(projectId)}/plugins/mcp`).send({
      name: "超额服务", command: executable, toolLimit: 1,
    });
    expect(overBudget.status).toBe(400);
    expect(overBudget.body.error).toContain("最多添加 3");
  });

  it("Given 用户显式添加真实技能目录, When 启用后移除, Then 路径已解析且不自动发现其他目录", async () => {
    const skillsRoot = path.join(testRoot, "custom-skills");
    const linkedPath = path.join(testRoot, "skill-link");
    fs.mkdirSync(skillsRoot, { recursive: true });
    try {
      fs.symlinkSync(skillsRoot, linkedPath, "junction");
    } catch {
      // 某些 CI 禁止创建链接；直接使用原目录仍可验证显式添加语义。
    }
    const inputPath = fs.existsSync(linkedPath) ? linkedPath : skillsRoot;
    const added = await request(app).post(`/api/projects/${encodeURIComponent(projectId)}/plugins/skills`).send({ path: inputPath });

    expect(added.status).toBe(200);
    const skill = added.body.data.skillDirectories[0];
    expect(skill.path).toBe(fs.realpathSync.native(skillsRoot));
    expect(skill.enabled).toBe(false);
    expect(added.body.data.skillDirectories).toHaveLength(1);

    const enabled = await request(app)
      .patch(`/api/projects/${encodeURIComponent(projectId)}/plugins/skills/${skill.id}`)
      .send({ enabled: true });
    expect(enabled.status).toBe(200);
    expect(enabled.body.data.skillDirectories[0].enabled).toBe(true);

    const removed = await request(app).delete(`/api/projects/${encodeURIComponent(projectId)}/plugins/skills/${skill.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.skillDirectories).toEqual([]);
  });
});
