import { describe, it, expect } from 'vitest';
import { channelToAgentRuntimeConfig } from '../channel-adapter.js';
import type { Channel, ChannelModel } from '../../types.js';

/** 构造一个最小可用的 Channel 对象 */
function makeChannel(overrides?: Partial<Channel>): Channel {
  return {
    id: 'test-channel-1',
    name: '测试渠道',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'sk-ant-test-key-12345',
    models: [
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', enabled: true },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', enabled: false },
    ],
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('channelToAgentRuntimeConfig', () => {
  // ── 基本转换 ────────────────────────────────────────────────────────────
  describe('基本转换', () => {
    it('应该正确传递 apiKey', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel);
      expect(config.apiKey).toBe('sk-ant-test-key-12345');
    });

    it('anthropic baseUrl 应该去除版本路径和后缀（Pi SDK 自行处理）', () => {
      // 使用带版本路径的 URL 以验证 strip 逻辑
      const channel = makeChannel({ baseUrl: 'https://api.anthropic.com/v1/messages' });
      const config = channelToAgentRuntimeConfig(channel);
      // normalizeBaseUrl → 去尾部斜杠（无）
      // replace /v\d+$ → 不匹配（后面还有 /messages）
      // replace /messages$ → 匹配，去除 → https://api.anthropic.com/v1
      expect(config.baseUrl).toBe('https://api.anthropic.com/v1');
    });

    it('默认模型应该为第一个 enabled 模型', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel);
      expect(config.model).toBe('claude-sonnet-5');
    });

    it('应该提供默认 cwd', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel);
      expect(typeof config.cwd).toBe('string');
      expect(config.cwd.length).toBeGreaterThan(0);
    });

    it('默认权限模式为 readonly，tools 应仅含只读工具', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel);
      expect(config.permissionMode).toBe('readonly');
      expect(config.tools).toEqual(['read', 'grep', 'find', 'ls']);
    });
  });

  // ── overrides 覆盖 ──────────────────────────────────────────────────────
  describe('overrides 覆盖', () => {
    it('overrides.model 应该覆盖默认模型', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel, {
        model: 'claude-opus-4-8',
      });
      expect(config.model).toBe('claude-opus-4-8');
    });

    it('overrides.cwd 应该覆盖默认 cwd', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel, {
        cwd: '/custom/path',
      });
      expect(config.cwd).toBe('/custom/path');
      expect(config.projectDir).toBe('/custom/path');
    });

    it('overrides.tools 应该覆盖默认 tools', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel, {
        tools: ['read', 'bash'],
      });
      expect(config.tools).toEqual(['read', 'bash']);
    });

    it('overrides.dataDir 应该正确传递', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel, {
        dataDir: '/data/custom',
      });
      expect(config.dataDir).toBe('/data/custom');
    });

    it('overrides.systemPrompt 应该正确传递', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel, {
        systemPrompt: '你是一个有用的助手',
      });
      expect(config.systemPrompt).toBe('你是一个有用的助手');
    });

    it('overrides.customTools 应该正确传递', () => {
      const channel = makeChannel();
      const customTools = [{ name: 'my_tool', description: '自定义工具' }];
      const config = channelToAgentRuntimeConfig(channel, {
        customTools,
      });
      expect(config.customTools).toEqual(customTools);
    });

    it('overrides.permissionMode 为 yolo 时应全量工具', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel, {
        permissionMode: 'yolo',
      });
      expect(config.permissionMode).toBe('yolo');
      expect(config.tools).toContain('write');
      expect(config.tools).toContain('edit');
      expect(config.tools).toContain('bash');
    });

    it('overrides.permissionMode 为 review 时应全量工具', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel, {
        permissionMode: 'review',
      });
      expect(config.permissionMode).toBe('review');
      expect(config.tools).toContain('write');
      expect(config.tools).toContain('bash');
    });

    it('overrides.projectId 应该覆盖 projectDir basename 回退', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel, {
        projectId: 'my-custom-project',
      });
      expect(config.projectId).toBe('my-custom-project');
    });

    it('overrides.sessionId 应该正确传递', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel, {
        sessionId: 'session-abc-123',
      });
      expect(config.sessionId).toBe('session-abc-123');
    });

    it('overrides.projectDir 单独传入时应该覆盖 cwd', () => {
      const channel = makeChannel();
      const config = channelToAgentRuntimeConfig(channel, {
        cwd: '/default/cwd',
        projectDir: '/specific/project',
      });
      expect(config.cwd).toBe('/specific/project');
      expect(config.projectDir).toBe('/specific/project');
    });
  });

  // ── 非兼容 provider ─────────────────────────────────────────────────────
  describe('非兼容 provider', () => {
    it('custom provider 应该抛出错误', () => {
      expect(() =>
        channelToAgentRuntimeConfig(
          makeChannel({ provider: 'custom', name: '自定义渠道' }),
        ),
      ).toThrow('不支持 Agent 模式');
    });

    it('错误消息应该包含渠道名和供应商名', () => {
      expect(() =>
        channelToAgentRuntimeConfig(
          makeChannel({ provider: 'custom', name: '我的自定义' }),
        ),
      ).toThrow(/我的自定义/);
      expect(() =>
        channelToAgentRuntimeConfig(
          makeChannel({ provider: 'custom', name: '我的自定义' }),
        ),
      ).toThrow(/custom/);
    });
  });

  // ── 模型相关 ────────────────────────────────────────────────────────────
  describe('模型选择', () => {
    it('所有模型都 disabled 时应该抛出错误', () => {
      expect(() =>
        channelToAgentRuntimeConfig(
          makeChannel({
            models: [
              { id: 'm1', name: 'M1', enabled: false },
              { id: 'm2', name: 'M2', enabled: false },
            ],
          }),
        ),
      ).toThrow('没有已启用的模型');
    });

    it('空模型列表应该抛出错误', () => {
      expect(() =>
        channelToAgentRuntimeConfig(makeChannel({ models: [] })),
      ).toThrow('未配置任何模型');
    });

    it('只有一个模型时应该选择该模型', () => {
      const channel = makeChannel({
        models: [{ id: 'gpt-5', name: 'GPT-5', enabled: true }],
      });
      const config = channelToAgentRuntimeConfig(channel);
      expect(config.model).toBe('gpt-5');
    });
  });

  // ── baseUrl 规范化 ──────────────────────────────────────────────────────
  describe('baseUrl 规范化', () => {
    it('deepseek baseUrl 尾部斜杠应该被去除', () => {
      const channel = makeChannel({
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com/anthropic/',
        models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', enabled: true }],
      });
      const config = channelToAgentRuntimeConfig(channel);
      expect(config.baseUrl).toBe('https://api.deepseek.com/anthropic');
    });

    it('anthropic baseUrl 带 /v1/messages 后缀时去除 /messages', () => {
      const channel = makeChannel({
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1/messages',
        models: [{ id: 'claude-sonnet-5', name: 'Claude Sonnet 5', enabled: true }],
      });
      const config = channelToAgentRuntimeConfig(channel);
      // normalizeBaseUrl + 先 strip /v\d+$ (不匹配，因后面还有 /messages)
      // 再 strip /messages$ → https://api.anthropic.com/v1
      expect(config.baseUrl).toBe('https://api.anthropic.com/v1');
    });

    it('anthropic baseUrl 仅带 /v1 后缀应该去除', () => {
      const channel = makeChannel({
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        models: [{ id: 'claude-sonnet-5', name: 'Claude Sonnet 5', enabled: true }],
      });
      const config = channelToAgentRuntimeConfig(channel);
      expect(config.baseUrl).toBe('https://api.anthropic.com');
    });

    it('kimi-api baseUrl 应该保持不变', () => {
      const channel = makeChannel({
        provider: 'kimi-api',
        baseUrl: 'https://api.moonshot.cn/anthropic',
        models: [{ id: 'kimi-latest', name: 'Kimi Latest', enabled: true }],
      });
      const config = channelToAgentRuntimeConfig(channel);
      expect(config.baseUrl).toBe('https://api.moonshot.cn/anthropic');
    });

    it('空 baseUrl 应该回退到 PROVIDER_DEFAULT_URLS', () => {
      const channel = makeChannel({
        provider: 'deepseek',
        baseUrl: '',
        models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', enabled: true }],
      });
      const config = channelToAgentRuntimeConfig(channel);
      expect(config.baseUrl).toBe('https://api.deepseek.com/anthropic');
    });
  });
});
