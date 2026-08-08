import { app, BrowserWindow, screen, shell, Tray } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWebHostContext } from '@contour/web-backend/host';
import { startServer, type StartedWebServer } from '@contour/web-backend/app';
import { resolveRuntimeConfig } from '@contour/web-backend/runtime';
import { registerIpcHandlers, IPC_CHANNELS } from './ipc.js';
import { loopbackUrl, normalizeWindowState, shouldHideOnClose, type SavedWindowState } from './lifecycle.js';
import { createTray, type RecentProject } from './tray.js';

const DEV_RENDERER_URL = 'http://127.0.0.1:3000';
const DEV_API_URL = 'http://127.0.0.1:3001/api/project';
const WINDOW_STATE_FILE = 'window-state.json';

if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Contour-dev'));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let webServer: StartedWebServer | null = null;
let isQuitting = false;
let cleanupStarted = false;
let windowStateTimer: ReturnType<typeof setTimeout> | null = null;

function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

function readWindowState(): SavedWindowState | undefined {
  try {
    return normalizeWindowState(JSON.parse(readFileSync(getWindowStatePath(), 'utf8')));
  } catch {
    return undefined;
  }
}

function saveWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    // 最大化状态下不跳过：同时记录 bounds 与 maximized 标志，
    // 下次启动先按 bounds 创建窗口再调用 maximize() 恢复全屏。
    writeFileSync(getWindowStatePath(), JSON.stringify({
      ...mainWindow.getBounds(),
      maximized: mainWindow.isMaximized(),
    }), 'utf8');
  } catch (error) {
    console.warn('[Contour] 无法保存窗口位置:', error);
  }
}

// 校验窗口矩形是否与任一显示器 workArea 相交，避免显示器拔出后窗口恢复到屏幕外。
function isWindowVisibleOnAnyDisplay(bounds: { x: number; y: number; width: number; height: number }): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      bounds.x < area.x + area.width &&
      bounds.x + bounds.width > area.x &&
      bounds.y < area.y + area.height &&
      bounds.y + bounds.height > area.y
    );
  });
}

// resize/move 高频事件防抖：250ms 内累积最后一次，避免每次同步写盘阻塞主进程。
function scheduleWindowStateSave(): void {
  if (windowStateTimer) clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(() => {
    windowStateTimer = null;
    saveWindowState();
  }, 250);
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function waitForHttp(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : 'service unavailable'}`);
}

async function startProductionHost(): Promise<string> {
  if (webServer) return loopbackUrl(webServer.port);
  const resolved = resolveRuntimeConfig({
    isDevelopment: false,
    homeDir: app.getPath('home') || os.homedir(),
    legacyVault: path.join(app.getPath('home') || os.homedir(), '.contour', 'legacy-vault'),
    readSettingsFile: (filePath) => readFileSync(filePath, 'utf-8'),
  });
  const context = createWebHostContext(resolved.coreConfig, {
    port: 0,
    mode: 'production',
    staticDir: path.join(__dirname, 'renderer'),
  });
  webServer = await startServer({ context });
  return loopbackUrl(webServer.port);
}

function openExternal(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') void shell.openExternal(url);
  } catch {
    // Electron has already rejected malformed navigation URLs.
  }
}

async function createMainWindow(): Promise<void> {
  const state = readWindowState();
  // 显示器拔出/分辨率变化后，保存的坐标可能落在屏幕外：仅当窗口矩形与
  // 任一显示器 workArea 相交时才恢复坐标，否则交给系统默认居中。
  const restorePosition = state?.x !== undefined && state.y !== undefined
    && isWindowVisibleOnAnyDisplay({ x: state.x, y: state.y, width: state.width, height: state.height });
  mainWindow = new BrowserWindow({
    width: state?.width ?? 1440,
    height: state?.height ?? 900,
    x: restorePosition ? state!.x : undefined,
    y: restorePosition ? state!.y : undefined,
    minWidth: 900,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 上次退出时处于最大化：先按保存的 bounds 建窗，再恢复最大化状态。
  if (state?.maximized) mainWindow.maximize();

  const origin = app.isPackaged
    ? await startProductionHost()
    : DEV_RENDERER_URL;
  if (!app.isPackaged) {
    await Promise.all([waitForHttp(DEV_RENDERER_URL), waitForHttp(DEV_API_URL)]);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin === origin) return;
    } catch {
      // A malformed navigation cannot be trusted or loaded in the renderer.
    }
    event.preventDefault();
    openExternal(url);
  });
  mainWindow.on('close', (event) => {
    // 关闭/隐藏前先 flush 尚未落盘的防抖保存。
    if (windowStateTimer) {
      clearTimeout(windowStateTimer);
      windowStateTimer = null;
      saveWindowState();
    }
    if (shouldHideOnClose(isQuitting)) {
      event.preventDefault();
      saveWindowState();
      mainWindow?.hide();
    }
  });
  mainWindow.on('resize', scheduleWindowStateSave);
  mainWindow.on('move', scheduleWindowStateSave);
  // 最大化/还原本身也会改变窗口状态，监听后统一走防抖保存。
  mainWindow.on('maximize', scheduleWindowStateSave);
  mainWindow.on('unmaximize', scheduleWindowStateSave);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  await mainWindow.loadURL(origin);
}

async function listRecentProjects(): Promise<RecentProject[]> {
  if (!webServer) return [];
  const projects = await webServer.context.coreServices.vault.loadProjects();
  return projects
    .slice(0, 8)
    .map((project) => ({ id: project.projectId, title: project.title || project.projectId }));
}

function requestNewAgentSession(): void {
  showMainWindow();
  mainWindow?.webContents.send(IPC_CHANNELS.newAgentSession);
}

function requestOpenProject(projectId: string): void {
  showMainWindow();
  mainWindow?.webContents.send(IPC_CHANNELS.projectOpen, projectId);
}

function requestQuit(): void {
  isQuitting = true;
  app.quit();
}

async function cleanup(): Promise<void> {
  if (cleanupStarted) return;
  cleanupStarted = true;
  tray?.destroy();
  tray = null;
  if (webServer) {
    // 只有真正退出（isQuitting）时才强制销毁窗口：窗口销毁会断开其持有的
    // SSE fetch 长连接，避免 webServer.close() 等待活跃连接；托盘常驻时
    // shouldHideOnClose 不会触发销毁，不影响隐藏到托盘的行为。
    if (isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
      mainWindow = null;
    }
    await webServer.close();
    webServer = null;
  }
}

if (hasSingleInstanceLock) {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(async () => {
    registerIpcHandlers(() => mainWindow, requestQuit);
    await createMainWindow();
    tray = createTray({
      showWindow: showMainWindow,
      newAgentSession: requestNewAgentSession,
      openProject: requestOpenProject,
      quit: requestQuit,
    }, listRecentProjects);
  }).catch((error) => {
    console.error('[Contour] 启动失败:', error);
    requestQuit();
  });

  app.on('before-quit', (event) => {
    isQuitting = true;
    if (!cleanupStarted) {
      event.preventDefault();
      void cleanup().finally(() => app.quit());
    }
  });
  app.on('activate', showMainWindow);
}
