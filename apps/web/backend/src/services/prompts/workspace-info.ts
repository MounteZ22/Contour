export interface WorkspacePathStatus {
  path: string;
  available: boolean;
}

export interface WorkspaceInfoInput {
  projectTitle?: string;
  researchGoal?: string;
  currentStage?: string;
  vaultPath: string;
  sessionWorkspacePath: string;
  attachedDirectories: WorkspacePathStatus[];
  attachedFiles: WorkspacePathStatus[];
  configWarning?: string;
}

function formatPathList(items: WorkspacePathStatus[]): string {
  if (items.length === 0) return "- 无";
  return items
    .map((item) => `- ${item.path}（${item.available ? "当前可用" : "暂时离线"}）`)
    .join("\n");
}

export function buildWorkspaceInfo(input: WorkspaceInfoInput): string {
  const lines = [
    "## 当前工作区",
    "",
    `- 项目名称：${input.projectTitle || "未识别"}`,
    `- 研究目标：${input.researchGoal || "未填写"}`,
    `- 当前阶段：${input.currentStage || "未填写"}`,
    `- Vault 路径：${input.vaultPath}`,
    `- Session 隔离工作目录：${input.sessionWorkspacePath}`,
    "",
    "### 项目配置中的附加目录",
    formatPathList(input.attachedDirectories),
    "",
    "### 项目配置中的附加文件",
    formatPathList(input.attachedFiles),
  ];

  if (input.configWarning) {
    lines.push("", `- 配置读取提示：${input.configWarning}`);
  }

  lines.push(
    "",
    "> 上述路径清单用于说明项目配置和在线状态，不代表 Pi 原生工具已获得这些绝对路径的访问权限。实际访问范围由 Contour 后端受控工具决定。",
  );
  return lines.join("\n");
}
