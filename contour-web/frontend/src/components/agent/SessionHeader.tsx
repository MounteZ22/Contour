import { useState } from 'react';
import { ArrowLeft, Check, PanelRight, Pencil, Trash2, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAtom } from 'jotai';
import { rightPanelOpenAtom } from '../../state/shell';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useAgentSessions, type AgentSession } from '../../hooks/useAgentSessions';

export function SessionHeader({ session }: { session: AgentSession }) {
  const navigate = useNavigate();
  const { updateSession, deleteSession } = useAgentSessions();
  const [rightPanelOpen, setRightPanelOpen] = useAtom(rightPanelOpenAtom);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);

  const handleSaveTitle = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    updateSession(session.id, { title: trimmed });
    setEditing(false);
  };

  const handleDelete = () => {
    if (!confirm(`确定要删除会话 "${session.title}" 吗？`)) return;
    deleteSession(session.id);
    navigate('/agent');
  };

  return (
    <header className="h-16 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl px-6 flex items-center justify-between gap-4">
      <div className="min-w-0 flex items-center gap-3">
        <Link to="/agent" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft size={16} />
          会话
        </Link>
        <div className="w-px h-5 bg-border" />
        {editing ? (
          <div className="flex items-center gap-2 min-w-[280px]">
            <Input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSaveTitle();
                if (event.key === 'Escape') {
                  setTitle(session.title);
                  setEditing(false);
                }
              }}
            />
            <Button size="icon" className="h-8 w-8" onClick={handleSaveTitle} type="button">
              <Check size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setTitle(session.title);
                setEditing(false);
              }}
              type="button"
            >
              <X size={14} />
            </Button>
          </div>
        ) : (
          <button
            className="min-w-0 inline-flex items-center gap-2 text-left group"
            onClick={() => setEditing(true)}
            type="button"
          >
            <h1 className="text-lg font-semibold font-headline truncate">{session.title}</h1>
            <Pencil size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={rightPanelOpen ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setRightPanelOpen((value) => !value)}
          type="button"
        >
          <PanelRight size={14} />
          文件
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={handleDelete}
          title="删除会话"
          type="button"
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </header>
  );
}
