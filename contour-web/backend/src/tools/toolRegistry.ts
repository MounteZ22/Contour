import { getFlowDetail, searchFlows, getDoc } from './vaultTools.js';

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
