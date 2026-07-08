import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Channel, ChannelModel, ProviderType } from '../../types';
import { PROVIDER_DEFAULT_URLS, PROVIDER_LABELS } from '../../types';
import { testChannelDirect, fetchModels } from '../../state/channels';

const PROVIDER_OPTIONS: ProviderType[] = ['anthropic', 'deepseek', 'kimi-api', 'kimi-coding', 'custom'];

interface ChannelFormProps {
  channel: Channel | null;
  onSaved: () => void;
  onCancel: () => void;
  onCreate?: (input: {
    name: string;
    provider: ProviderType;
    baseUrl: string;
    apiKey: string;
    models: ChannelModel[];
    enabled: boolean;
  }) => Promise<void>;
  onUpdate?: (id: string, input: {
    name?: string;
    provider?: ProviderType;
    baseUrl?: string;
    apiKey?: string;
    models?: ChannelModel[];
    enabled?: boolean;
  }) => Promise<void>;
}

export function ChannelForm({ channel, onSaved, onCancel, onCreate, onUpdate }: ChannelFormProps) {
  const isEdit = channel !== null;

  const [name, setName] = useState(channel?.name ?? '');
  const [provider, setProvider] = useState<ProviderType>(channel?.provider ?? 'anthropic');
  const [baseUrl, setBaseUrl] = useState(channel?.baseUrl ?? PROVIDER_DEFAULT_URLS.anthropic);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [models, setModels] = useState<ChannelModel[]>(channel?.models ?? []);
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ success: boolean; message: string } | null>(null);

  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');

  // 编辑模式：加载已保存的 API Key
  useEffect(() => {
    if (isEdit && channel) {
      setApiKey(channel.apiKey);
    }
  }, [isEdit, channel]);

  // 切换供应商时自动更新 Base URL
  const handleProviderChange = (p: ProviderType) => {
    setProvider(p);
    setBaseUrl(PROVIDER_DEFAULT_URLS[p]);
    setTestResult(null);
  };

  // 测试连接
  const handleTest = async () => {
    if (!apiKey.trim() || !baseUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testChannelDirect(provider, baseUrl, apiKey);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : '测试失败',
      });
    } finally {
      setTesting(false);
    }
  };

  // 拉取模型列表
  const handleFetchModels = async () => {
    if (!apiKey.trim() || !baseUrl.trim()) return;
    setFetchingModels(true);
    setFetchResult(null);
    try {
      const result = await fetchModels(provider, baseUrl, apiKey);
      setFetchResult(result);
      if (result.success && result.models.length > 0) {
        const existingIds = new Set(models.map((m) => m.id));
        const newModels = result.models
          .filter((m) => !existingIds.has(m.id))
          .map((m) => ({ ...m, enabled: false }));
        if (newModels.length > 0) {
          setModels((prev) => [...prev, ...newModels]);
        }
      }
    } catch (err) {
      setFetchResult({
        success: false,
        message: err instanceof Error ? err.message : '拉取失败',
      });
    } finally {
      setFetchingModels(false);
    }
  };

  // 添加模型
  const handleAddModel = () => {
    if (!newModelId.trim()) return;
    const model: ChannelModel = {
      id: newModelId.trim(),
      name: newModelName.trim() || newModelId.trim(),
      enabled: true,
    };
    setModels((prev) => [...prev, model]);
    setNewModelId('');
    setNewModelName('');
  };

  // 删除模型
  const handleRemoveModel = (modelId: string) => {
    setModels((prev) => prev.filter((m) => m.id !== modelId));
  };

  // 切换模型启用状态
  const handleToggleModel = (modelId: string) => {
    setModels((prev) => prev.map((m) => (m.id === modelId ? { ...m, enabled: !m.enabled } : m)));
  };

  // 保存
  const handleSave = async () => {
    if (!name.trim() || !apiKey.trim()) return;

    setSaving(true);
    try {
      if (isEdit && channel && onUpdate) {
        await onUpdate(channel.id, {
          name,
          provider,
          baseUrl,
          apiKey,
          models,
          enabled,
        });
      } else if (onCreate) {
        await onCreate({
          name,
          provider,
          baseUrl,
          apiKey,
          models,
          enabled,
        });
      }
      setSaveError(null);
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败，请重试';
      setSaveError(message);
      console.error('保存渠道失败:', err);
    } finally {
      setSaving(false);
    }
  };

  const enabledModels = models.filter((m) => m.enabled);
  const disabledModels = models.filter((m) => !m.enabled);

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center gap-3">
        <button
          className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface transition-colors cursor-pointer"
          onClick={onCancel}
          type="button"
        >
          <ArrowLeft size={18} />
        </button>
        <h3 className="text-base font-semibold text-text-primary font-headline flex-1">
          {isEdit ? '编辑模型配置' : '添加模型配置'}
        </h3>
        <button
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer bg-accent-strong text-accent-on hover:bg-accent-hover disabled:opacity-50"
          disabled={saving || !name.trim() || !apiKey.trim()}
          onClick={handleSave}
          type="button"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          <span>{isEdit ? '保存' : '创建'}</span>
        </button>
      </div>

      {/* 保存错误提示 */}
      {saveError && (
        <div className="flex items-center gap-1.5 text-xs text-danger">
          <XCircle size={12} />
          <span>{saveError}</span>
        </div>
      )}

      {/* 基本信息 */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-text-primary">基本信息</h4>
        <div className="rounded-xl border border-border bg-surface-sunken overflow-hidden">
          {/* 名称 */}
          <div className="px-4 py-3 space-y-2">
            <div className="text-sm font-medium text-text-primary">配置名称</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: My Anthropic"
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface-raised text-text-primary text-sm outline-none focus:border-accent-strong/40 font-mono"
            />
          </div>

          {/* 供应商 */}
          <div className="px-4 py-3 space-y-2 border-t border-border/40">
            <div className="text-sm font-medium text-text-primary">供应商类型</div>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as ProviderType)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface-raised text-text-primary text-sm outline-none focus:border-accent-strong/40 font-mono"
            >
              {PROVIDER_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {/* Base URL */}
          <div className="px-4 py-3 space-y-2 border-t border-border/40">
            <div className="text-sm font-medium text-text-primary">Base URL</div>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface-raised text-text-primary text-sm outline-none focus:border-accent-strong/40 font-mono"
            />
          </div>

          {/* API Key + 测试 */}
          <div className="px-4 py-3 space-y-2 border-t border-border/40">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-text-primary">API Key</div>
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors cursor-pointer border-border bg-surface-sunken text-text-primary hover:bg-surface disabled:opacity-50"
                disabled={testing || !apiKey.trim() || !baseUrl.trim()}
                onClick={handleTest}
                type="button"
              >
                {testing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                <span>测试连接</span>
              </button>
            </div>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEdit ? '留空则不更新' : '输入 API Key'}
                className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-surface-raised text-text-primary text-sm outline-none focus:border-accent-strong/40 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary transition-colors"
                tabIndex={-1}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {testResult && (
              <div
                className={`flex items-center gap-1.5 text-xs ${
                  testResult.success ? 'text-success' : 'text-danger'
                }`}
              >
                {testResult.success ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* 启用开关 */}
          <div className="px-4 py-3 flex items-center justify-between border-t border-border/40">
            <div>
              <div className="text-sm font-medium text-text-primary">启用此配置</div>
              <div className="text-sm text-text-secondary">关闭后该配置的模型不会在选择列表中出现</div>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                enabled ? 'bg-accent-strong' : 'bg-border'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-accent-on transition-transform ${
                  enabled ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 已启用模型 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-text-primary">
            已启用模型
            {enabledModels.length > 0 && (
              <span className="text-text-secondary ml-2">({enabledModels.length})</span>
            )}
          </h4>
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors cursor-pointer border-border bg-surface-sunken text-text-primary hover:bg-surface disabled:opacity-50"
            disabled={fetchingModels || !apiKey.trim() || !baseUrl.trim()}
            onClick={handleFetchModels}
            type="button"
          >
            {fetchingModels ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            <span>从供应商获取</span>
          </button>
        </div>

        {fetchResult && (
          <div
            className={`flex items-center gap-1.5 text-xs ${
              fetchResult.success ? 'text-success' : 'text-danger'
            }`}
          >
            {fetchResult.success ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            <span>{fetchResult.message}</span>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface-sunken overflow-hidden">
          {enabledModels.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-text-secondary">
              还没有启用任何模型，从供应商获取或手动添加
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {enabledModels.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center gap-2 px-4 py-2.5 group"
                >
                  <CheckCircle2 size={14} className="text-success flex-shrink-0" />
                  <span className="text-sm text-text-primary flex-1">
                    {model.name}
                    {model.name !== model.id && (
                      <span className="text-text-secondary ml-1">({model.id})</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleModel(model.id)}
                    className="p-0.5 text-text-secondary hover:text-danger transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="取消启用"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 可用模型 */}
      {disabledModels.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-text-primary">
            可用模型
            <span className="text-text-secondary ml-2">({disabledModels.length})</span>
          </h4>
          <div className="rounded-xl border border-border bg-surface-sunken overflow-hidden">
            <div className="divide-y divide-border/40">
              {disabledModels.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center gap-2 px-4 py-2.5 group cursor-pointer hover:bg-surface/50 transition-colors"
                  onClick={() => handleToggleModel(model.id)}
                >
                  <Plus size={14} className="text-text-secondary flex-shrink-0" />
                  <span className="text-sm text-text-primary flex-1">
                    {model.name}
                    {model.name !== model.id && (
                      <span className="text-text-secondary ml-1">({model.id})</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveModel(model.id);
                    }}
                    className="p-0.5 text-text-secondary hover:text-danger transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="删除"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 手动添加模型 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newModelId}
          onChange={(e) => setNewModelId(e.target.value)}
          placeholder="模型 ID"
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface-raised text-text-primary text-sm outline-none focus:border-accent-strong/40 font-mono"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddModel();
            }
          }}
        />
        <input
          type="text"
          value={newModelName}
          onChange={(e) => setNewModelName(e.target.value)}
          placeholder="显示名称（可选）"
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface-raised text-text-primary text-sm outline-none focus:border-accent-strong/40 font-mono"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddModel();
            }
          }}
        />
        <button
          type="button"
          onClick={handleAddModel}
          disabled={!newModelId.trim()}
          className="p-2 rounded-lg border border-border bg-surface-sunken text-text-primary hover:bg-surface disabled:opacity-50 cursor-pointer transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
