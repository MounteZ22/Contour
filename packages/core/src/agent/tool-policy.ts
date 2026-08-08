/** Contour 必须自行保护的核心文件工具名。 */
const CORE_FILE_TOOLS = new Set(['read', 'write', 'edit', 'bash', 'grep', 'find', 'ls']);
const READ_TOOLS = new Set(['read', 'grep', 'find', 'ls']);
const WRITE_TOOLS = new Set(['write', 'edit']);

export interface NamedAgentTool {
  name: string;
  [key: string]: unknown;
}

/**
 * 生成最终工具清单，确保调用方不能重新启用 bash 或覆盖受控文件工具。
 * review/yolo 的区别只在是否确认；两者的可写路径范围完全相同。
 */
export function applyAgentToolPolicy(input: {
  requestedTools?: string[];
  customTools?: unknown[];
  contourFileTools: NamedAgentTool[];
  allowWrite: boolean;
}): { tools: string[]; customTools: NamedAgentTool[] } {
  const externalCustomTools = (input.customTools ?? []).filter((tool): tool is NamedAgentTool => {
    if (!tool || typeof tool !== 'object') return false;
    const name = (tool as { name?: unknown }).name;
    return typeof name === 'string' && !CORE_FILE_TOOLS.has(name);
  });
  const contourFileTools = input.contourFileTools.filter((tool) =>
    READ_TOOLS.has(tool.name) || (input.allowWrite && WRITE_TOOLS.has(tool.name))
  );
  const customTools = [...externalCustomTools, ...contourFileTools];
  const requestedTools = (input.requestedTools ?? ['read']).filter((name) =>
    READ_TOOLS.has(name) || (input.allowWrite && WRITE_TOOLS.has(name))
  );

  return {
    tools: Array.from(new Set([...requestedTools, ...customTools.map((tool) => tool.name)])),
    customTools,
  };
}
