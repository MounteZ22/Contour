import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentRuntimeConfig } from "../agent-runtime.js";
import { PiRuntime } from "../pi-runtime.js";

interface TestResourceLoader {
  getAgentsFiles(): { agentsFiles: Array<{ path: string; content: string }> };
  getSkills(): { skills: Array<{ name: string }> };
}

describe("PiRuntime ResourceLoader", () => {
  it("Given 会话目录含有祖先指导文件, When 创建 loader, Then 不让 Pi 自动注入它们", async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "contour-pi-loader-"));
    try {
      fs.writeFileSync(path.join(workspaceDir, "AGENTS.md"), "不应被 Pi 自动读取", "utf-8");
      fs.writeFileSync(path.join(workspaceDir, "CLAUDE.md"), "不应被 Pi 自动读取", "utf-8");

      const config: AgentRuntimeConfig = {
        apiKey: "test-key",
        baseUrl: "https://example.invalid",
        model: "test-model",
        projectDir: workspaceDir,
        projectId: "test-project",
        dataDir: workspaceDir,
        sessionId: "test-session",
      };
      const runtime = new PiRuntime();
      const createResourceLoader = (runtime as unknown as {
        createResourceLoader(
          input: AgentRuntimeConfig,
          authStorage: unknown,
          effectiveCwd: string,
        ): Promise<TestResourceLoader>;
      }).createResourceLoader.bind(runtime);

      const loader = await createResourceLoader(config, undefined, workspaceDir);

      expect(loader.getAgentsFiles().agentsFiles).toEqual([]);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("Given 用户显式启用技能目录, When 创建 loader, Then 只加载该目录而不自动发现会话目录技能", async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "contour-pi-skill-loader-"));
    const explicitSkills = path.join(workspaceDir, "explicit-skills");
    try {
      fs.mkdirSync(explicitSkills);
      fs.mkdirSync(path.join(workspaceDir, "untrusted-skills"));
      fs.writeFileSync(path.join(explicitSkills, "SKILL.md"), "---\nname: explicit\ndescription: explicit skill\n---\n# Explicit", "utf-8");
      fs.writeFileSync(path.join(workspaceDir, "untrusted-skills", "SKILL.md"), "---\nname: hidden\ndescription: hidden skill\n---\n# Hidden", "utf-8");
      const config: AgentRuntimeConfig = {
        apiKey: "test-key", baseUrl: "https://example.invalid", model: "test-model",
        projectDir: workspaceDir, projectId: "test-project", dataDir: workspaceDir, sessionId: "test-session",
        additionalSkillPaths: [explicitSkills],
      };
      const runtime = new PiRuntime();
      const createResourceLoader = (runtime as unknown as {
        createResourceLoader(input: AgentRuntimeConfig, authStorage: unknown, effectiveCwd: string): Promise<TestResourceLoader>;
      }).createResourceLoader.bind(runtime);

      const loader = await createResourceLoader(config, undefined, workspaceDir);
      expect(loader.getSkills().skills.map((skill) => skill.name)).toEqual(["explicit"]);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
