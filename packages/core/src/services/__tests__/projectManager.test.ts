import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

let testRoot!: string;
let projectsDir!: string;

vi.mock("../../runtime/config.js", async () => {
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  testRoot = join(tmpdir(), `contour-project-manager-${Date.now()}`);
  projectsDir = join(testRoot, "data", "projects");
  return { CONFIG: { PROJECTS_DIR: projectsDir, DATA_DIR: testRoot, CONFIG_DIR: testRoot, VAULTS_DIR: testRoot, LEGACY_VAULT: testRoot } };
});

const {
  attachDirectory,
  attachFile,
  detachDirectory,
  detachFile,
  getProjectConfig,
  getProjectConfigStatus,
  saveProjectConfig,
  validateProjectId,
} = await import("../projectManager.js");

const attachmentRoot = path.join(testRoot, "external");
const projectId = "膜实验_2026";

beforeEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  fs.mkdirSync(attachmentRoot, { recursive: true });
});

afterAll(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe("projectManager 项目配置", () => {
  it("Given 旧配置没有 attachedFiles, When 读取, Then 自动补为空数组", () => {
    const projectDir = path.join(projectsDir, projectId);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ projectDir: "D:\\Contour-dev\\膜实验", attachedDirectories: [] }),
      "utf-8",
    );

    expect(getProjectConfig(projectId)).toEqual({
      projectDir: "D:\\Contour-dev\\膜实验",
      attachedDirectories: [],
      attachedFiles: [],
    });
  });

  it("Given 路径后来离线, When 读取状态, Then 保留路径并标记不可用", () => {
    const missingDirectory = path.join(attachmentRoot, "offline-disk");
    const missingFile = path.join(attachmentRoot, "offline.xlsx");
    saveProjectConfig({
      projectDir: "",
      attachedDirectories: [missingDirectory],
      attachedFiles: [missingFile],
    }, projectId);

    expect(getProjectConfigStatus(projectId)).toEqual({
      projectDir: "",
      attachedDirectories: [{ path: path.normalize(missingDirectory), available: false }],
      attachedFiles: [{ path: path.normalize(missingFile), available: false }],
    });
    expect(getProjectConfig(projectId).attachedDirectories).toHaveLength(1);
  });

  it("Given 有效文件夹和文件, When 重复添加, Then 规范化并各只保存一次", () => {
    const folder = path.join(attachmentRoot, "资料");
    const file = path.join(attachmentRoot, "结果.csv");
    fs.mkdirSync(folder);
    fs.writeFileSync(file, "a,b\n1,2\n", "utf-8");

    attachDirectory(`${folder}${path.sep}.`, projectId);
    attachDirectory(folder, projectId);
    attachFile(file, projectId);
    attachFile(file, projectId);

    const config = getProjectConfig(projectId);
    expect(config.attachedDirectories).toEqual([fs.realpathSync.native(folder)]);
    expect(config.attachedFiles).toEqual([fs.realpathSync.native(file)]);
    expect(fs.readdirSync(path.join(projectsDir, projectId)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("Given 文件和文件夹类型传反, When 添加, Then 明确拒绝", () => {
    const folder = path.join(attachmentRoot, "资料");
    const file = path.join(attachmentRoot, "结果.csv");
    fs.mkdirSync(folder);
    fs.writeFileSync(file, "data", "utf-8");

    expect(() => attachDirectory(file, projectId)).toThrow("路径不是目录");
    expect(() => attachFile(folder, projectId)).toThrow("路径不是文件");
  });

  it("Given 已配置路径, When 删除两次, Then 操作幂等且不要求路径仍存在", () => {
    const folder = path.join(attachmentRoot, "资料");
    const file = path.join(attachmentRoot, "结果.csv");
    fs.mkdirSync(folder);
    fs.writeFileSync(file, "data", "utf-8");
    attachDirectory(folder, projectId);
    attachFile(file, projectId);
    fs.rmSync(folder, { recursive: true });
    fs.rmSync(file);

    detachDirectory(folder, projectId);
    detachDirectory(folder, projectId);
    detachFile(file, projectId);
    detachFile(file, projectId);

    expect(getProjectConfig(projectId)).toEqual({
      projectDir: "",
      attachedDirectories: [],
      attachedFiles: [],
    });
  });

  it("Given 中文 basename 与越界 ID, Then 只接受安全的项目 ID", () => {
    expect(() => validateProjectId("中文项目_01")).not.toThrow();
    expect(() => validateProjectId("../escape")).toThrow("项目 ID 无效");
    expect(() => validateProjectId("..\\escape")).toThrow("项目 ID 无效");
  });

  it("Given config.json 已损坏, When 读取, Then 明确失败而不是覆盖为空配置", () => {
    const projectDir = path.join(projectsDir, projectId);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "config.json"), "{broken json", "utf-8");

    expect(() => getProjectConfig(projectId)).toThrow("已停止写入以保护原数据");
    expect(fs.readFileSync(path.join(projectDir, "config.json"), "utf-8")).toBe("{broken json");
  });
});
