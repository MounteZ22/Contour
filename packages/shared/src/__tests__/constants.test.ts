import { describe, expect, it } from 'vitest';
import {
  PROVIDER_DEFAULT_URLS,
  PROVIDER_LABELS,
  type ProviderType,
} from '../types.js';

const PROVIDERS: ProviderType[] = ['anthropic', 'deepseek', 'kimi-api', 'kimi-coding', 'custom'];

describe('@contour/shared 渠道常量', () => {
  it('Given 全部 ProviderType, When 查询默认 URL, Then 每个供应商都有值', () => {
    for (const provider of PROVIDERS) {
      expect(PROVIDER_DEFAULT_URLS[provider]).toBeDefined();
    }
  });

  it('Given 全部 ProviderType, When 查询标签, Then 每个供应商都有中文标签', () => {
    for (const provider of PROVIDERS) {
      expect(PROVIDER_LABELS[provider].length).toBeGreaterThan(0);
    }
  });

  it('Given custom 供应商, When 查询默认 URL, Then 为空字符串（由用户填写）', () => {
    expect(PROVIDER_DEFAULT_URLS.custom).toBe('');
  });
});
