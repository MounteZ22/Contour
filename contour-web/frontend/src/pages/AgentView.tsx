import { useRef, useState } from 'react';
import { Bot } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAtom } from 'jotai';
import { ChatInputBar } from '../components/agent/ChatInputBar';
import type { PermissionMode } from '../hooks/useChat';
import { useAgentSessions } from '../hooks/useAgentSessions';
import { useSessionModelSelection } from '../state/agentModelSelection';
import { chatContextItemsAtom, chatDraftsAtom } from '../state/chat';
import type { ShellOutletContext } from '../components/shell/ShellLayout';

/**
 * 新会话入口不会预先创建 session；用户发送第一条消息时才创建并进入对应会话。
 */
export function AgentView() {
  const navigate = useNavigate();
  const { project } = useOutletContext<ShellOutletContext>();
  const [contextItems, setChatContextItems] = useAtom(chatContextItemsAtom);
  const [drafts, setDrafts] = useAtom(chatDraftsAtom);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('readonly');
  const { createSession } = useAgentSessions(project?.projectId);
  const creatingSessionRef = useRef(false);
  const draftKey = `agent-start:${project?.projectId ?? 'none'}`;
  const modelSelector = useSessionModelSelection(draftKey);
  const inputValue = drafts[draftKey] ?? '';

  const setInputValue = (value: string) => {
    setDrafts((previous) => previous[draftKey] === value ? previous : { ...previous, [draftKey]: value });
  };

  const handleSend = async () => {
    const message = inputValue.trim();
    if (!message || !project || creatingSessionRef.current) return;
    creatingSessionRef.current = true;

    const session = createSession(contextItems, project.projectId);
    modelSelector.transferTo(session.id);
    setDrafts((previous) => ({ ...previous, [draftKey]: '' }));
    setChatContextItems([]);
    navigate(`/agent/${session.id}`, { state: { initialMessage: message } });
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background px-6 py-8">
      <div className="mx-auto flex min-h-full max-w-[720px] flex-col justify-center pb-20">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-accent-subtle-bg text-accent-strong">
            <Bot size={24} />
          </div>
          <h1 className="mt-4 text-xl font-semibold font-headline">开始新的 Agent 会话</h1>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            输入第一条消息后，Contour 会为本次讨论建立独立会话。
          </p>
        </div>

        <ChatInputBar
          inputValue={inputValue}
          onInputChange={setInputValue}
          isLoading={false}
          onSend={handleSend}
          onStop={() => undefined}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
          onClear={() => setInputValue('')}
          hasMessages={false}
          permissionMode={permissionMode}
          onPermissionModeChange={setPermissionMode}
          contextItems={contextItems}
          modelOptions={modelSelector.options}
          selectedModel={modelSelector.selectedOption}
          modelStatus={modelSelector.status}
          onModelChange={modelSelector.selectModel}
        />
      </div>
    </div>
  );
}
