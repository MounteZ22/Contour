export interface ContourDesktopBridge {
  minimize(): Promise<void>;
  show(): Promise<void>;
  close(): Promise<void>;
  quit(): Promise<void>;
  onNewAgentSession(listener: () => void): () => void;
  onOpenProject(listener: (projectId: string) => void): () => void;
}

declare global {
  interface Window {
    contourDesktop?: ContourDesktopBridge;
  }
}

export function installDesktopBridge(): void {
  window.contourDesktop?.onNewAgentSession(() => {
    window.dispatchEvent(new Event('contour:new-agent-session'));
  });
  window.contourDesktop?.onOpenProject((projectId) => {
    window.dispatchEvent(new CustomEvent<string>('contour:project-open', { detail: projectId }));
  });
}

installDesktopBridge();
