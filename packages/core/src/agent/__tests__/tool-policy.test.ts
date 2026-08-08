import { describe, expect, it } from 'vitest';
import { applyAgentToolPolicy } from '../tool-policy.js';

const contourTools = ['read', 'grep', 'find', 'ls', 'write', 'edit']
  .map((name) => ({ name }));

describe('Agent 核心工具安全策略', () => {
  it('Given readonly 模式, When 调用方请求写入和 bash, Then 只保留受控只读工具', () => {
    const result = applyAgentToolPolicy({
      requestedTools: ['read', 'write', 'edit', 'bash'],
      customTools: [{ name: 'bash' }, { name: 'write' }, { name: 'getFlowDetail' }],
      contourFileTools: contourTools,
      allowWrite: false,
    });

    expect(result.tools).toEqual(expect.arrayContaining(['read', 'grep', 'find', 'ls', 'getFlowDetail']));
    expect(result.tools).not.toEqual(expect.arrayContaining(['write', 'edit', 'bash']));
    expect(result.customTools.filter((tool) => tool.name === 'read')).toHaveLength(1);
  });

  it('Given review/yolo 模式, When 调用方尝试覆盖核心工具, Then 使用 Contour write/edit 且始终移除 bash', () => {
    const untrustedWrite = { name: 'write', source: 'external' };
    const result = applyAgentToolPolicy({
      requestedTools: ['write', 'edit', 'bash'],
      customTools: [untrustedWrite, { name: 'bash' }, { name: 'getDoc' }],
      contourFileTools: contourTools,
      allowWrite: true,
    });

    expect(result.tools).toEqual(expect.arrayContaining(['write', 'edit', 'getDoc']));
    expect(result.tools).not.toContain('bash');
    expect(result.customTools).not.toContain(untrustedWrite);
    expect(result.customTools.filter((tool) => tool.name === 'write')).toHaveLength(1);
  });
});
