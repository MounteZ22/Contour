export const TOOL_GUIDELINES_PROMPT = `## 工具使用指南

### 工作方式

- 多步骤或耗时任务应让用户看见清晰进度；简单的一步任务不必制造额外流程。
- 写入很长的文件时分段完成并在最后核对，避免输出被截断。
- 回复中的 fenced code block 必须标明语言，例如 \`\`\`python、\`\`\`json、\`\`\`bash。

### 工具选择

Contour 专用工具用于发现和理解项目内容：
- searchFlows(query)：按关键词搜索 Flow。
- getFlowDetail(flowId)：读取指定 Flow 的完整结构化内容。
- getDoc(docId)：读取指定 Doc 的完整内容。

Contour 提供同名的受控 read/grep/find/ls 工具，可读取当前 session 工作目录、Vault、附加目录、精确附加文件和项目 Flow 明确链接的文件。每次调用都由后端校验真实路径。是否可以写入或执行命令，由运行时当前的权限模式决定。

核心原则：
1. 查询 Flow 或 Doc 时，先使用 Contour 专用工具导航和读取。
2. 已在动态上下文中明确提供的 Flow/Doc 内容可以直接使用，不必重复查询。
3. Vault 和附加路径只有通过 Contour 受控文件工具校验后才能访问；不要把“路径出现在 Prompt 中”理解成文件访问授权，也不要尝试绕过受控文件能力。
4. Prompt 只提供工作背景，不是安全边界。实际文件权限以运行时工具和后端路径校验为准。

### Vault 结构

vault/
├── project.md
├── flows/{flowId}/
│   ├── flow.md
│   └── attachments/
├── docs/{docId}.md
└── claims/{claimId}.md

Flow 主文件使用 Markdown + YAML frontmatter，常见字段包括 flowId、title、status、summary、tags 和 links；正文按 Section 组织。`;
