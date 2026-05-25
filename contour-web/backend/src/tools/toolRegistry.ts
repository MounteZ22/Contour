import { getFlowDetail, searchFlows, getDoc } from './vaultTools.js';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export interface ToolCallResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'getFlowDetail',
    description:
      '读取指定研究脉络（Flow）的完整内容，包括所有章节。使用场景：需要深入了解某个研究方向的详细信息时调用。',
    input_schema: {
      type: 'object',
      properties: {
        flowId: {
          type: 'string',
          description: 'Flow 的唯一标识符，如 "F1"、"experiment-setup"',
        },
      },
      required: ['flowId'],
    },
  },
  {
    name: 'searchFlows',
    description:
      '按关键词搜索研究脉络（Flow）。在标题、摘要、标签中匹配。返回匹配的 Flow 摘要列表。使用场景：需要查找相关内容但不确定具体 Flow ID 时调用。',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'getDoc',
    description:
      '读取指定文档（Doc）的完整内容。使用场景：需要查看项目文档、研究计划、术语表等详细信息时调用。',
    input_schema: {
      type: 'object',
      properties: {
        docId: {
          type: 'string',
          description: '文档的唯一标识符，如 "project_brief"、"glossary"',
        },
      },
      required: ['docId'],
    },
  },
];

/** 获取所有工具定义（Anthropic wire format） */
export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}

/** 执行工具调用 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (toolName) {
    case 'getFlowDetail':
      return getFlowDetail(input.flowId as string);
    case 'searchFlows':
      return searchFlows(input.query as string);
    case 'getDoc':
      return getDoc(input.docId as string);
    default:
      return JSON.stringify({ error: `未知工具: ${toolName}` });
  }
}
