import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawn = vi.fn(() => ({
  on: vi.fn(),
  unref: vi.fn(),
}));
vi.mock('node:child_process', () => ({ spawn }));

const { openWithSystem, revealInFileManager } = await import('../hostFileActions.js');

describe('宿主文件动作', () => {
  beforeEach(() => {
    spawn.mockClear();
  });

  it('Given Windows 文件路径含空格和特殊字符, When 打开, Then 通过环境变量传递而不拼接到命令中', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
    try {
      openWithSystem('C:\\Research Data\\result;$(whoami).xlsx');
    } finally {
      Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform });
    }

    expect(spawn).toHaveBeenCalledWith(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -LiteralPath $env:CONTOUR_TARGET'],
      expect.objectContaining({ env: expect.objectContaining({ CONTOUR_TARGET: 'C:\\Research Data\\result;$(whoami).xlsx' }) }),
    );
    const args = (spawn.mock.calls as unknown as Array<[string, string[]]>)[0][1];
    expect(args).not.toContain('C:\\Research Data\\result;$(whoami).xlsx');
  });

  it('Given 系统启动器不可用, When 发起操作, Then 注册 error 监听而不抛出未处理异常', () => {
    revealInFileManager('C:\\Research Data\\result.xlsx');

    const child = spawn.mock.results[0]?.value as { on: ReturnType<typeof vi.fn> };
    expect(child.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
