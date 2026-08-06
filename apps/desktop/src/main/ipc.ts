import { BrowserWindow, ipcMain } from 'electron';

export const IPC_CHANNELS = {
  minimize: 'contour:window:minimize',
  show: 'contour:window:show',
  close: 'contour:window:close',
  quit: 'contour:app:quit',
} as const;

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  requestQuit: () => void,
): void {
  ipcMain.handle(IPC_CHANNELS.minimize, () => getMainWindow()?.minimize());
  ipcMain.handle(IPC_CHANNELS.show, () => {
    const window = getMainWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  ipcMain.handle(IPC_CHANNELS.close, () => getMainWindow()?.hide());
  ipcMain.handle(IPC_CHANNELS.quit, requestQuit);
}
