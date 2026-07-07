import { describe, it, expect } from 'vitest';
import { validateId, ValidationError } from '../validate.js';

describe('ValidationError', () => {
  it('应该包含正确的错误名称', () => {
    const err = new ValidationError('测试错误');
    expect(err.name).toBe('ValidationError');
    expect(err.message).toBe('测试错误');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('validateId', () => {
  it('合法的纯字母 ID 应该通过校验', () => {
    expect(() => validateId('abcDef', 'testId')).not.toThrow();
  });

  it('合法的字母数字 ID 应该通过校验', () => {
    expect(() => validateId('flow001', 'flowId')).not.toThrow();
  });

  it('包含连字符的合法 ID 应该通过校验', () => {
    expect(() => validateId('my-flow-01', 'flowId')).not.toThrow();
  });

  it('包含下划线的合法 ID 应该通过校验', () => {
    expect(() => validateId('my_flow_01', 'flowId')).not.toThrow();
  });

  it('数字开头的合法 ID 应该通过校验', () => {
    expect(() => validateId('001test', 'testId')).not.toThrow();
  });

  it('恰好 64 个字符的 ID 应该通过校验', () => {
    const id = 'a' + 'b'.repeat(63); // 64 chars total
    expect(() => validateId(id, 'testId')).not.toThrow();
  });

  it('超过 64 个字符的 ID 应该抛出错误', () => {
    const id = 'a' + 'b'.repeat(64); // 65 chars total
    expect(() => validateId(id, 'testId')).toThrow(ValidationError);
  });

  it('包含空格的 ID 应该抛出错误', () => {
    expect(() => validateId('my flow', 'flowId')).toThrow(ValidationError);
    expect(() => validateId('my flow', 'flowId')).toThrow(/Only letters, numbers, hyphens and underscores/);
  });

  it('包含中文字符的 ID 应该抛出错误', () => {
    expect(() => validateId('流程001', 'flowId')).toThrow(ValidationError);
  });

  it('包含特殊字符的 ID 应该抛出错误', () => {
    expect(() => validateId('flow@001', 'flowId')).toThrow(ValidationError);
    expect(() => validateId('flow#001', 'flowId')).toThrow(ValidationError);
    expect(() => validateId('flow/001', 'flowId')).toThrow(ValidationError);
  });

  it('空字符串应该抛出错误', () => {
    expect(() => validateId('', 'testId')).toThrow(ValidationError);
  });

  it('非字符串类型应该抛出错误', () => {
    expect(() => validateId(123, 'testId')).toThrow(ValidationError);
    expect(() => validateId(null, 'testId')).toThrow(ValidationError);
    expect(() => validateId(undefined, 'testId')).toThrow(ValidationError);
  });

  it('下划线开头的 ID 应该抛出错误（必须以字母或数字开头）', () => {
    expect(() => validateId('_hidden', 'testId')).toThrow(ValidationError);
  });

  it('连字符开头的 ID 应该抛出错误（必须以字母或数字开头）', () => {
    expect(() => validateId('-start', 'testId')).toThrow(ValidationError);
  });

  it('错误消息应该包含字段名', () => {
    expect(() => validateId('invalid!', 'projectId'))
      .toThrow(/Invalid projectId/);
  });
});
