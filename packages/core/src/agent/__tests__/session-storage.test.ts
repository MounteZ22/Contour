import { mkdtempSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createOrResumePiSession,
  deleteProductSession,
  ensureProductSession,
  findPiSessionFile,
  getSessionSummary,
  getSessionWorkspaceDir,
  listPiSessionFiles,
  listProductSessions,
  scanSessionMessages,
  updateProductSession,
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

  it('重命名应持久化到产品会话索引', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'contour-session-'));
    await ensureProductSession(dataDir, 'project-a', 'session_rename', '原始标题');

    const updated = await updateProductSession(dataDir, 'project-a', 'session_rename', {
      title: '重命名后的会话',
    });

    expect(updated.title).toBe('重命名后的会话');
    const reopened = await ensureProductSession(dataDir, 'project-a', 'session_rename');
    expect(reopened.meta.title).toBe('重命名后的会话');
  });

  it('deleteProductSession 应在互斥锁内删除 registry 记录与工作区目录', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'contour-session-'));
    await createOrResumePiSession(dataDir, 'project-a', 'session_del', '待删除');

    const deleted = await deleteProductSession(dataDir, 'project-a', 'session_del');
    expect(deleted).toBe(true);
    expect(listProductSessions(dataDir, 'project-a')).toHaveLength(0);

    // 目录与记录已删除，重新创建应得到全新会话
    const recreated = await ensureProductSession(dataDir, 'project-a', 'session_del');
    expect(recreated.created).toBe(true);

    const missing = await deleteProductSession(dataDir, 'project-a', 'ghost');
    expect(missing).toBe(false);
  });

  it('scanSessionMessages 应流式统计消息数并提取最后一条消息文本', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'contour-session-'));
    const handle = await createOrResumePiSession(dataDir, 'project-a', 'session_scan', '扫描会话');
    handle.manager.appendMessage({ role: 'user', content: 'hello', timestamp: Date.now() } as never);
    handle.manager.appendMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'world' }],
      timestamp: Date.now(),
      api: 'anthropic-messages', provider: 'anthropic', model: 'test', usage: {}, stopReason: 'stop',
    } as never);

    const scanned = await scanSessionMessages(handle.manager.getSessionFile()!);

    expect(scanned.messageCount).toBe(2);
    expect(scanned.lastMessage).toBe('world');
  });

  it('listPiSessionFiles 应一次性返回全部已写盘会话的 Pi 文件映射', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'contour-session-'));
    const first = await createOrResumePiSession(dataDir, 'project-a', 'session_one');
    const second = await createOrResumePiSession(dataDir, 'project-a', 'session_two');
    // Pi SDK 延迟写盘：首个 assistant 回复到达时才 flush JSONL 文件
    first.manager.appendMessage({ role: 'user', content: 'u1', timestamp: Date.now() } as never);
    first.manager.appendMessage({
      role: 'assistant', content: 'a1', timestamp: Date.now(),
      api: 'anthropic-messages', provider: 'anthropic', model: 'test', usage: {}, stopReason: 'stop',
    } as never);
    second.manager.appendMessage({ role: 'user', content: 'u2', timestamp: Date.now() } as never);
    second.manager.appendMessage({
      role: 'assistant', content: 'a2', timestamp: Date.now(),
      api: 'anthropic-messages', provider: 'anthropic', model: 'test', usage: {}, stopReason: 'stop',
    } as never);

    const files = listPiSessionFiles(dataDir, 'project-a');

    expect(files.size).toBe(2);
    expect(files.get('session_one')).toBe(first.manager.getSessionFile());
    expect(files.get('session_two')).toBe(second.manager.getSessionFile());
  });

  it('getSessionSummary 应返回标题与消息数（缓存复用后结果一致）', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'contour-session-'));
    const handle = await createOrResumePiSession(dataDir, 'project-a', 'session_summary', '缓存会话');
    handle.manager.appendMessage({ role: 'user', content: 'hi', timestamp: Date.now() } as never);
    handle.manager.appendMessage({ role: 'assistant', content: 'yo', timestamp: Date.now() } as never);

    const first = getSessionSummary(dataDir, 'project-a', 'session_summary');
    const second = getSessionSummary(dataDir, 'project-a', 'session_summary');

    expect(first?.title).toBe('缓存会话');
    expect(first?.messageCount).toBe(2);
    expect(second).toEqual(first);
  });
});
