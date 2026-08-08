import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { Channel } from '@contour/shared';
import { PROVIDER_LABELS } from '@contour/shared';
import { listChannels, createChannel, updateChannel, deleteChannel } from '../../state/channels';
import { SettingsSection, SettingsCard, SettingsRow } from './primitives';
import { ChannelForm } from './ChannelForm';

type ViewMode = 'list' | 'create' | 'edit';

export function ChannelSettings() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);

  const loadChannels = useCallback(async () => {
    try {
      const list = await listChannels();
      setChannels(list);
    } catch (error) {
      console.error('加载渠道失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const handleCreate = async (input: Parameters<typeof createChannel>[0]) => {
    await createChannel(input);
  };

  const handleUpdate = async (id: string, input: Parameters<typeof updateChannel>[1]) => {
    await updateChannel(id, input);
  };

  const handleDelete = async (channel: Channel) => {
    if (!confirm(`确定删除渠道「${channel.name}」？此操作不可恢复。`)) return;
    try {
      await deleteChannel(channel.id);
      await loadChannels();
    } catch (err) {
      console.error('删除渠道失败:', err);
    }
  };

  const handleToggle = async (channel: Channel) => {
    try {
      await updateChannel(channel.id, { enabled: !channel.enabled });
      await loadChannels();
    } catch (err) {
      console.error('切换渠道状态失败:', err);
    }
  };

  const handleFormSaved = async () => {
    setViewMode('list');
    setEditingChannel(null);
    await loadChannels();
  };

  const handleFormCancel = () => {
    setViewMode('list');
    setEditingChannel(null);
  };

  // 表单视图
  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <ChannelForm
        channel={editingChannel}
        onCancel={handleFormCancel}
        onCreate={viewMode === 'create' ? handleCreate : undefined}
        onSaved={handleFormSaved}
        onUpdate={viewMode === 'edit' ? handleUpdate : undefined}
      />
    );
  }

  // 列表视图
  return (
    <div className="space-y-8">
      <SettingsSection
        title="模型配置"
        action={
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer bg-accent-strong text-accent-on hover:bg-accent-hover"
            onClick={() => setViewMode('create')}
            type="button"
          >
            <Plus size={14} />
            <span>添加配置</span>
          </button>
        }
      >
        {loading ? (
          <div className="text-sm text-text-secondary py-8 text-center">加载中...</div>
        ) : channels.length === 0 ? (
          <SettingsCard divided={false}>
            <div className="px-4 py-12 text-center text-sm text-text-secondary">
              还没有配置任何模型，点击上方「添加配置」开始
            </div>
          </SettingsCard>
        ) : (
          <SettingsCard>
            {channels.map((channel) => {
              const enabledCount = channel.models.filter((m) => m.enabled).length;
              const description = [
                PROVIDER_LABELS[channel.provider],
                enabledCount > 0 ? `${enabledCount} 个模型已启用` : '无可用模型',
              ].join(' · ');

              return (
                <SettingsRow
                  className="group"
                  description={description}
                  key={channel.id}
                  label={channel.name}
                >
                  <div className="flex items-center gap-2">
                    <button
                      className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      onClick={() => {
                        setEditingChannel(channel);
                        setViewMode('edit');
                      }}
                      title="编辑"
                      type="button"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="p-1.5 rounded-md text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      onClick={() => handleDelete(channel)}
                      title="删除"
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                        channel.enabled ? 'bg-accent-strong' : 'bg-border'
                      }`}
                      onClick={() => handleToggle(channel)}
                      type="button"
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-accent-on transition-transform ${
                          channel.enabled ? 'translate-x-4.5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </SettingsRow>
              );
            })}
          </SettingsCard>
        )}
      </SettingsSection>
    </div>
  );
}
