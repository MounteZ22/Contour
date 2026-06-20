import { useEffect, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAtom } from 'jotai';
import { chatContextItemsAtom } from '../state/chat';
import { useAgentSessions } from '../hooks/useAgentSessions';
import type { ShellOutletContext } from '../components/shell/ShellLayout';

export function AgentView() {
  const navigate = useNavigate();
  const { project } = useOutletContext<ShellOutletContext>();
  const [contextItems, setChatContextItems] = useAtom(chatContextItemsAtom);
  const { createSession } = useAgentSessions();
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;

    const items = contextItems.length > 0 ? contextItems : [];
    const session = createSession(items);
    setChatContextItems([]);
    navigate(`/agent/${session.id}`, { replace: true });
  }, [contextItems, createSession, navigate, setChatContextItems]);

  return null;
}
