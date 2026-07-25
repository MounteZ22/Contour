import { mkdtempSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createOrResumePiSession,
  ensureProductSession,
  findPiSessionFile,
  getSessionWorkspaceDir,
} from '../session-storage.js';

describe('Agent Session 存储', () => {
  it('产品 sessionId 与 Pi SDK sessionId 应解耦', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'contour-session-'));
    const workspaceDir = getSessionWorkspaceDir(dataDir, 'project-a', 'session_abc123');

    const created = await createOrResumePiSession(dataDir, 'project-a', 'session_abc123', '测试会话');
    const header = created.manager.getHeader();

    expect(created.workspaceDir).toBe(workspaceDir);
    expect(header).toMatchObject({
      type: 'session',
      version: 3,
      cwd: workspaceDir,
    });
    expect(header?.id).not.toBe('session_abc123');
    expect(created.productSession.sdkSessionId).toBe(header?.id);
  });

  it('同一 projectId 和 sessionId 应恢复同一个文件', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'contour-session-'));
    const first = await createOrResumePiSession(dataDir, 'project-a', 'session_same', '第一次');
    first.manager.appendMessage({ role: 'user', content: 'hello', timestamp: Date.now() } as never);
    first.manager.appendMessage({
      role: 'assistant', content: [{ type: 'text', text: 'world' }], timestamp: Date.now(),
      api: 'anthropic-messages', provider: 'anthropic', model: 'test', usage: {}, stopReason: 'stop',
    } as never);
    const second = await createOrResumePiSession(dataDir, 'project-a', 'session_same', '第二次');

    expect(second.created).toBe(false);
    expect(second.manager.getSessionId()).toBe(first.manager.getSessionId());
    expect(findPiSessionFile(dataDir, 'project-a', 'session_same')).toBe(first.manager.getSessionFile());
  });

  it('不同会话应拥有相互隔离的 cwd', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'contour-session-'));

    const first = await createOrResumePiSession(dataDir, 'project-a', 'session_one');
    const second = await createOrResumePiSession(dataDir, 'project-a', 'session_two');

    expect(first.workspaceDir).not.toBe(second.workspaceDir);
    expect(first.workspaceDir).toContain(path.join('sessions', 'session_one'));
    expect(second.workspaceDir).toContain(path.join('sessions', 'session_two'));
  });

  it('Pi 历史丢失时应保留产品会话并重建 SDK 映射', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'contour-session-'));
    const first = await createOrResumePiSession(dataDir, 'project-a', 'session_rebuild', '可恢复会话');
    first.manager.appendMessage({ role: 'user', content: 'hello', timestamp: Date.now() } as never);
    first.manager.appendMessage({
      role: 'assistant', content: [{ type: 'text', text: 'world' }], timestamp: Date.now(),
      api: 'anthropic-messages', provider: 'anthropic', model: 'test', usage: {}, stopReason: 'stop',
    } as never);
    const firstSdkId = first.manager.getSessionId();
    unlinkSync(first.manager.getSessionFile()!);

    const rebuilt = await createOrResumePiSession(dataDir, 'project-a', 'session_rebuild');

    expect(rebuilt.productSession.id).toBe('session_rebuild');
    expect(rebuilt.productSession.title).toBe('可恢复会话');
    expect(rebuilt.manager.getSessionId()).not.toBe(firstSdkId);
    expect(rebuilt.productSession.sdkSessionId).toBe(rebuilt.manager.getSessionId());
  });

  it('路径标识不得包含路径穿越字符', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'contour-session-'));

    await expect(ensureProductSession(dataDir, '../outside', 'session_ok')).rejects.toThrow('projectId');
    await expect(ensureProductSession(dataDir, 'project-a', '../outside')).rejects.toThrow('sessionId');
  });

  it('registry 损坏时不得静默覆盖原文件', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'contour-session-'));
    const sessionsDir = path.join(dataDir, 'projects', 'project-a', 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(path.join(sessionsDir, 'index.json'), '{broken json', 'utf-8');

    await expect(ensureProductSession(dataDir, 'project-a', 'session_safe')).rejects.toThrow();
  });
});
