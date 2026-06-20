import { Bot, MessageSquare, Plus } from 'lucide-react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { chatContextItemsAtom } from '../state/chat';
import { useAgentSessions } from '../hooks/useAgentSessions';
import type { ShellOutletContext } from '../components/shell/ShellLayout';

function formatTime(time: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(time);
}

export function AgentView() {
  const navigate = useNavigate();
  const { project } = useOutletContext<ShellOutletContext>();
  const contextItems = useAtomValue(chatContextItemsAtom);
  const { sessions, createSession } = useAgentSessions();

  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const hasPendingContext = contextItems.length > 0;

  const handleCreateSession = () => {
    const session = createSession(contextItems);
    navigate(`/agent/${session.id}`);
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <header className="flex items-start justify-between gap-4 pb-4 border-b border-border">
        <div>
          <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary">
            {project ? project.title : 'No Project'}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground font-headline">Agent 会话</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            这里是统一的 AI 工作区。Contour 多选、文档讨论和后续文件生成都会进入会话。
          </p>
        </div>
        <Button onClick={handleCreateSession} type="button">
          <Plus size={16} />
          新建会话
        </Button>
      </header>

      {hasPendingContext && (
        <Card className="mt-6 p-5 border-primary/20 bg-primary/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary">已带入 Contour 上下文</p>
              <p className="mt-1 text-sm text-muted-foreground">
                新建会话后，将把 {contextItems.length} 个 Flow / 文档作为讨论范围。
              </p>
            </div>
            <Button size="sm" onClick={handleCreateSession} type="button">
              开始讨论
            </Button>
          </div>
        </Card>
      )}

      <section className="mt-8 grid gap-4">
        {sortedSessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Bot size={36} className="mx-auto text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold font-headline">还没有会话</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              可以直接新建，也可以回到 Contour 视图多选 Flow 和文档后再开始。
            </p>
            <Button className="mt-5" onClick={handleCreateSession} type="button">
              <Plus size={16} />
              新建会话
            </Button>
          </div>
        ) : (
          sortedSessions.map((session) => (
            <Link key={session.id} to={`/agent/${session.id}`}>
              <Card className="p-5 transition-all hover:border-primary/25 hover:shadow-md">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <MessageSquare size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-base font-semibold font-headline truncate">{session.title}</h2>
                      <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                        {formatTime(session.updatedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                      {session.lastMessage || '还没有消息'}
                    </p>
                    {session.contextItems.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {session.contextItems.slice(0, 5).map((item) => (
                          <span
                            key={`${item.type}-${item.id}`}
                            className="px-2 py-0.5 rounded-md border border-border text-[10px] font-mono text-muted-foreground"
                          >
                            {item.type === 'flow' ? 'F' : 'D'} {item.id}
                          </span>
                        ))}
                        {session.contextItems.length > 5 && (
                          <span className="px-2 py-0.5 rounded-md border border-border text-[10px] font-mono text-muted-foreground">
                            +{session.contextItems.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
