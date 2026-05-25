import { loadProjects } from '../vault/loader.js';
import { CONFIG } from '../config.js';
import type { AIContextItem, ProjectData } from '../types.js';

/**
 * 根据用户选中的上下文，构建 AI system prompt
 */
export async function buildSystemPrompt(
  contextItems: AIContextItem[],
  projectId?: string,
): Promise<string> {
  const projects = await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);
  const project = projectId
    ? projects.find((p) => p.projectId === projectId)
    : undefined;

  let prompt = `你是一个科研助手 AI，帮助研究人员在 Contour 平台上进行研究工作。\n\n`;

  // 注入项目级上下文
  if (project) {
    prompt += `## 当前项目\n`;
    prompt += `- 项目名称：${project.title}\n`;
    prompt += `- 研究目标：${project.researchGoal}\n`;
    prompt += `- 当前阶段：${project.currentStage}\n\n`;
  }

  // 注入选中的 Flow 和 Doc 内容
  for (const item of contextItems) {
    if (item.type === 'flow') {
      const flow = project?.flows.find((f) => f.flowId === item.id);
      if (flow) {
        prompt += `## Flow: ${flow.title} (${flow.flowId})\n`;
        prompt += `- 状态：${flow.status}\n`;
        prompt += `- 摘要：${flow.summary}\n`;
        prompt += `- 标签：${flow.tags.join(', ') || '无'}\n`;
        prompt += `- 未解决问题：${flow.openUncertainties.join(', ') || '无'}\n\n`;
        for (const section of flow.sections) {
          prompt += `### Section: ${section.title}\n${section.content}\n\n`;
        }
      }
    } else if (item.type === 'doc') {
      const doc = project?.docs.find((d) => d.id === item.id);
      if (doc) {
        prompt += `## 文档: ${doc.title} (${doc.id})\n`;
        prompt += `- 类型：${doc.type}\n`;
        prompt += `${doc.content}\n\n`;
      }
    }
  }

  prompt += `\n请基于以上上下文回答用户的问题。如果问题超出了提供的上下文范围，请诚实说明。\n`;

  return prompt;
}
