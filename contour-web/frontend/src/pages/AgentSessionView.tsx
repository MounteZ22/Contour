import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { Button } from '../components/ui/button';
import { FilePreview } from '../components/agent/FilePreview';
import { SessionChat } from '../components/agent/SessionChat';
import { SessionHeader } from '../components/agent/SessionHeader';
import { previewFileAtom } from '../state/chat';
import { useAgentSessions } from '../hooks/useAgentSessions';

export function AgentSessionView() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { getSession } = useAgentSessions();
  const previewFile = useAtomValue(previewFileAtom);
  const setPreviewFile = useSetAtom(previewFileAtom);
  const session = getSession(sessionId);

  useEffect(() => {
    setPreviewFile(null);
  }, [sessionId, setPreviewFile]);

  if (!session) {
    return (
      <div className="h-full p-8 flex items-center justify-center">
        <div className="rounded-xl border border-border bg-card p-8 text-center max-w-md">
          <h1 className="text-lg font-semibold font-headline">会话不存在</h1>
          <p className="mt-2 text-sm text-muted-foreground">这个会话可能已被删除，或本地记录不存在。</p>
          <Button className="mt-5" onClick={() => navigate('/agent')} type="button">
            返回会话列表
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <SessionHeader session={session} />
      <div className="flex-1 min-h-0 flex">
        <div className={previewFile ? 'w-1/2 min-w-[360px] min-h-0' : 'flex-1 min-w-0 min-h-0'}>
          <SessionChat session={session} />
        </div>
        {previewFile && (
          <div className="flex-1 min-w-[360px] min-h-0">
            <FilePreview />
          </div>
        )}
      </div>
    </div>
  );
}
