import { spawn } from 'node:child_process';
import path from 'node:path';

function launch(command: string, args: string[]): void {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', (error) => {
    console.warn('[本机文件操作] 启动系统程序失败:', error.message);
  });
  child.unref();
}

/** 使用操作系统为该路径配置的默认程序打开。 */
export function openWithSystem(targetPath: string): void {
  if (process.platform === 'win32') {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Start-Process -LiteralPath $env:CONTOUR_TARGET',
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, CONTOUR_TARGET: targetPath },
    });
    child.on('error', (error) => {
      console.warn('[本机文件操作] 启动默认程序失败:', error.message);
    });
    child.unref();
  } else if (process.platform === 'darwin') {
    launch('open', [targetPath]);
  } else {
    launch('xdg-open', [targetPath]);
  }
}

/** 在文件管理器中定位文件；目录则直接打开该目录。 */
export function revealInFileManager(targetPath: string): void {
  if (process.platform === 'win32') {
    launch('explorer.exe', [`/select,${targetPath}`]);
  } else if (process.platform === 'darwin') {
    launch('open', ['-R', targetPath]);
  } else {
    launch('xdg-open', [path.dirname(targetPath)]);
  }
}
