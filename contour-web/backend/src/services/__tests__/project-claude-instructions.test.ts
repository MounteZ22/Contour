import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_PROJECT_GUIDANCE_BYTES,
  MAX_PROJECT_GUIDANCE_LINES,
  MAX_PROJECT_CLAUDE_BYTES,
  MAX_PROJECT_CLAUDE_LINES,
  loadProjectGuidanceInstructions,
  loadProjectClaudeInstructions,
} from "../project-claude-instructions.js";

function createProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "contour-claude-instructions-"));
}

function removeProjectRoot(projectRoot: string): void {
  fs.rmSync(projectRoot, { recursive: true, force: true });
}

describe("项目根 AGENTS.md / CLAUDE.md 的受控读取", () => {
  it("Given 项目根有两个合规 UTF-8 文件, When 读取, Then 按 AGENTS.md 后 CLAUDE.md 返回原始内容和规范路径", async () => {
    const projectRoot = createProjectRoot();
    try {
      const agentsPath = path.join(projectRoot, "AGENTS.md");
      const claudePath = path.join(projectRoot, "CLAUDE.md");
      fs.writeFileSync(agentsPath, "# Agent 规则\n先检查数据", "utf-8");
      fs.writeFileSync(claudePath, "# Claude 规则\n再汇报结果", "utf-8");

      await expect(loadProjectGuidanceInstructions(projectRoot)).resolves.toEqual([
        {
          fileName: "AGENTS.md",
          path: fs.realpathSync.native(agentsPath),
          content: "# Agent 规则\n先检查数据",
        },
        {
          fileName: "CLAUDE.md",
          path: fs.realpathSync.native(claudePath),
          content: "# Claude 规则\n再汇报结果",
        },
      ]);
    } finally {
      removeProjectRoot(projectRoot);
    }
  });

  it("Given 两个文件均不存在, When 读取, Then 返回空列表", async () => {
    const projectRoot = createProjectRoot();
    try {
      await expect(loadProjectGuidanceInstructions(projectRoot)).resolves.toEqual([]);
    } finally {
      removeProjectRoot(projectRoot);
    }
  });

  it("Given 指引文件超出字节或行数限制或含二进制内容, When 读取, Then 分别跳过不合规文件", async () => {
    const projectRoot = createProjectRoot();
    const agentsPath = path.join(projectRoot, "AGENTS.md");
    const claudePath = path.join(projectRoot, "CLAUDE.md");
    try {
      fs.writeFileSync(agentsPath, "a".repeat(MAX_PROJECT_GUIDANCE_BYTES + 1), "utf-8");
      fs.writeFileSync(claudePath, "合规内容", "utf-8");
      await expect(loadProjectGuidanceInstructions(projectRoot)).resolves.toHaveLength(1);

      fs.writeFileSync(agentsPath, Array.from({ length: MAX_PROJECT_GUIDANCE_LINES + 1 }, () => "规则").join("\n"), "utf-8");
      await expect(loadProjectGuidanceInstructions(projectRoot)).resolves.toHaveLength(1);

      fs.writeFileSync(agentsPath, Buffer.from([0x61, 0x00, 0x62]));
      await expect(loadProjectGuidanceInstructions(projectRoot)).resolves.toHaveLength(1);

      fs.writeFileSync(agentsPath, Buffer.from([0xc3, 0x28]));
      await expect(loadProjectGuidanceInstructions(projectRoot)).resolves.toHaveLength(1);

      fs.writeFileSync(agentsPath, "合规内容", "utf-8");
      fs.writeFileSync(claudePath, Buffer.from([0xc3, 0x28]));
      await expect(loadProjectGuidanceInstructions(projectRoot)).resolves.toEqual([
        {
          fileName: "AGENTS.md",
          path: fs.realpathSync.native(agentsPath),
          content: "合规内容",
        },
      ]);

      fs.writeFileSync(claudePath, "合规内容", "utf-8");

      // 旧常量与兼容入口仍保持原有语义。
      expect(MAX_PROJECT_CLAUDE_BYTES).toBe(MAX_PROJECT_GUIDANCE_BYTES);
      expect(MAX_PROJECT_CLAUDE_LINES).toBe(MAX_PROJECT_GUIDANCE_LINES);
      await expect(loadProjectClaudeInstructions(projectRoot)).resolves.toEqual({
        path: fs.realpathSync.native(claudePath),
        content: "合规内容",
      });
    } finally {
      removeProjectRoot(projectRoot);
    }
  });

  it("Given AGENTS.md 经 realpath 指向项目外, When 读取, Then 不读取越界内容且继续读取合规 CLAUDE.md", async () => {
    const projectRoot = path.join(os.tmpdir(), "contour-project");
    const agentsCandidate = path.join(projectRoot, "AGENTS.md");
    const claudeCandidate = path.join(projectRoot, "CLAUDE.md");
    const readFile = vi.fn(async (inputPath: string) => {
      if (inputPath === agentsCandidate) throw new Error("越界文件不能读取");
      return Buffer.from("仅 CLAUDE.md 被读取", "utf-8");
    });

    const result = await loadProjectGuidanceInstructions(projectRoot, {
      realpath: vi.fn(async (inputPath: string) => {
        if (inputPath === projectRoot) return projectRoot;
        if (inputPath === agentsCandidate) return path.join(os.tmpdir(), "outside", "AGENTS.md");
        return claudeCandidate;
      }),
      lstat: vi.fn(async () => ({ isFile: () => true, isSymbolicLink: () => false })),
      readFile,
    });

    expect(result).toEqual([{ fileName: "CLAUDE.md", path: claudeCandidate, content: "仅 CLAUDE.md 被读取" }]);
    expect(readFile).toHaveBeenCalledOnce();
    expect(readFile).toHaveBeenCalledWith(claudeCandidate);
    expect(agentsCandidate).toContain("AGENTS.md");
  });
});
