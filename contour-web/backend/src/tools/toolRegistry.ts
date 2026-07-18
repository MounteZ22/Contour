import { getFlowDetail, searchFlows, getDoc } from './vaultTools.js';

/** 执行工具调用 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  projectId?: string,
): Promise<string> {
  switch (toolName) {
    case 'getFlowDetail': {
      const flowId = typeof input.flowId === 'string' ? input.flowId : '';
      if (!flowId) return JSON.stringify({ error: '缺少参数 flowId' });
      return getFlowDetail(flowId, projectId);
    }
    case 'searchFlows': {
      const query = typeof input.query === 'string' ? input.query : '';
      if (!query) return JSON.stringify({ error: '缺少参数 query' });
      return searchFlows(query, projectId);
    }
    case 'getDoc': {
      const docId = typeof input.docId === 'string' ? input.docId : '';
      if (!docId) return JSON.stringify({ error: '缺少参数 docId' });
      return getDoc(docId, projectId);
    }
    default:
      return JSON.stringify({ error: `未知工具: ${toolName}` });
  }
}
