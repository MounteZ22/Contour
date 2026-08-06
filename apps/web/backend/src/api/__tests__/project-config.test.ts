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
  testRoot = join(tmpdir(), `contour-project-config-api-${Date.now()}`);
  projectsDir = join(testRoot, "data", "projects");
  vaultsDir = join(testRoot, "vaults");
  return {
    PROJECTS_DIR: projectsDir,
    CONFIG: { VAULTS_DIR: vaultsDir, LEGACY_VAULT: join(testRoot, "legacy") },
  };
});

await import('../../config.js');
const { createProjectConfigRouter } = await import("../project-config.js");
const projectConfigRouter = createProjectConfigRouter(createTestHostContext({ dataDir: testRoot, projectsDir, vaultsDir, legacyVault: path.join(testRoot, "legacy") }));

const app = express();
app.use(express.json());
app.use("/api/projects", projectConfigRouter);

const attachmentRoot = path.join(testRoot, "external");
const projectId = "中文项目_01";

beforeEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  fs.mkdirSync(attachmentRoot, { recursive: true });
});

afterAll(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe("项目配置 API", () => {
  it("Given 离线路径已保存, When GET config, Then 路径仍返回且 available=false", async () => {
    const configDir = path.join(projectsDir, projectId);
    const missing = path.join(attachmentRoot, "移动硬盘");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({
      projectDir: "D:\\Contour-dev\\中文项目",
      attachedDirectories: [missing],
      attachedFiles: [],
    }), "utf-8");

    const response = await request(app).get(`/api/projects/${encodeURIComponent(projectId)}/config`);

    expect(response.status).toBe(200);
    expect(response.body.data.attachedDirectories).toEqual([
      { path: path.normalize(missing), available: false },
    ]);
  });

  it("Given 旧项目尚无 config.json, When GET config, Then 自动记录真实 Vault 路径", async () => {
    const existingProjectDir = path.join(vaultsDir, projectId);
    fs.mkdirSync(existingProjectDir, { recursive: true });

    const response = await request(app).get(`/api/projects/${encodeURIComponent(projectId)}/config`);

    expect(response.status).toBe(200);
    expect(response.body.data.projectDir).toBe(existingProjectDir);
    expect(fs.existsSync(path.join(projectsDir, projectId, "config.json"))).toBe(true);
  });

  it("Given 有效路径, When POST folders/files, Then 配置返回可用状态", async () => {
    const folder = path.join(attachmentRoot, "论文");
    const file = path.join(attachmentRoot, "结果.xlsx");
    fs.mkdirSync(folder);
    fs.writeFileSync(file, "content", "utf-8");

    const folderResponse = await request(app)
      .post(`/api/projects/${encodeURIComponent(projectId)}/folders`)
      .send({ path: folder });
    const fileResponse = await request(app)
      .post(`/api/projects/${encodeURIComponent(projectId)}/files`)
      .send({ path: file });

    expect(folderResponse.status).toBe(200);
    expect(folderResponse.body.data.attachedDirectories[0].available).toBe(true);
    expect(fileResponse.status).toBe(200);
    expect(fileResponse.body.data.attachedFiles[0]).toEqual({
      path: fs.realpathSync.native(file),
      available: true,
    });
  });

  it("Given 类型错误或相对路径, When POST, Then 返回 400", async () => {
    const file = path.join(attachmentRoot, "not-a-folder.txt");
    fs.writeFileSync(file, "content", "utf-8");

    const wrongType = await request(app)
      .post(`/api/projects/${projectId}/folders`)
      .send({ path: file });
    const relative = await request(app)
      .post(`/api/projects/${projectId}/files`)
      .send({ path: "relative.txt" });

    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error).toContain("路径不是目录");
    expect(relative.status).toBe(400);
    expect(relative.body.error).toContain("绝对路径");
  });

  it("Given 已添加文件, When DELETE 两次, Then 两次都成功且结果为空", async () => {
    const file = path.join(attachmentRoot, "结果.xlsx");
    fs.writeFileSync(file, "content", "utf-8");
    await request(app).post(`/api/projects/${projectId}/files`).send({ path: file });

    const first = await request(app).delete(`/api/projects/${projectId}/files`).send({ path: file });
    const second = await request(app).delete(`/api/projects/${projectId}/files`).send({ path: file });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.attachedFiles).toEqual([]);
  });

  it("Given 越界项目 ID, When 请求配置, Then 返回 400 且不创建越界目录", async () => {
    const response = await request(app).get("/api/projects/%2E%2E%5Cescape/config");

    expect(response.status).toBe(400);
    expect(fs.existsSync(path.join(testRoot, "data", "escape"))).toBe(false);
  });
});
