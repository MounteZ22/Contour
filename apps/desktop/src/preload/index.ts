import { contextBridge, ipcRenderer } from 'electron';

const channels = {
  minimize: 'contour:window:minimize',
  show: 'contour:window:show',
  close: 'contour:window:close',
  quit: 'contour:app:quit',
  newAgentSession: 'contour:tray:new-agent-session',
  projectOpen: 'contour:project:open',
} as const;

contextBridge.exposeInMainWorld('contourDesktop', {
  minimize: () => ipcRenderer.invoke(channels.minimize),
  show: () => ipcRenderer.invoke(channels.show),
  close: () => ipcRenderer.invoke(channels.close),
  quit: () => ipcRenderer.invoke(channels.quit),
  onNewAgentSession: (listener: () => void) => {
    const wrapped = () => listener();
    ipcRenderer.on(channels.newAgentSession, wrapped);
    return () => ipcRenderer.removeListener(channels.newAgentSession, wrapped);
  },
  onOpenProject: (listener: (projectId: string) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, projectId: string) => listener(projectId);
    ipcRenderer.on(channels.projectOpen, wrapped);
    return () => ipcRenderer.removeListener(channels.projectOpen, wrapped);
  },
});
