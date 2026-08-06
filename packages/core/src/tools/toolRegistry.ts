import type { VaultTools } from './vaultTools.js';

/** Creates the Core business-tool dispatcher bound to one Vault runtime. */
export function createToolRegistry(vaultTools: VaultTools) {
  async function executeTool(toolName: string, input: Record<string, unknown>, projectId?: string): Promise<string> {
    switch (toolName) {
      case 'getFlowDetail': {
        const flowId = typeof input.flowId === 'string' ? input.flowId : '';
        return flowId ? vaultTools.getFlowDetail(flowId, projectId) : JSON.stringify({ error: '缺少参数 flowId' });
      }
      case 'searchFlows': {
        const query = typeof input.query === 'string' ? input.query : '';
        return query ? vaultTools.searchFlows(query, projectId) : JSON.stringify({ error: '缺少参数 query' });
      }
      case 'getDoc': {
        const docId = typeof input.docId === 'string' ? input.docId : '';
        return docId ? vaultTools.getDoc(docId, projectId) : JSON.stringify({ error: '缺少参数 docId' });
      }
      default:
        return JSON.stringify({ error: `未知工具: ${toolName}` });
    }
  }
  return { executeTool };
}

export type ToolRegistry = ReturnType<typeof createToolRegistry>;
