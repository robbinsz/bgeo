import React, { useEffect, useState } from 'react';
import { BrandIcon } from '../../components/common/BrandIcon';
import { api } from '../../services/api';
import { Page, ResourceState, useResource, useAction } from '../../components/ui/Resource';

export function SettingsView({
  onShowToast,
}: {
  onShowToast: (title: string, note?: string) => void;
}) {
  const project = useResource(api.getProject);
  const schedule = useResource(api.getSchedule);
  const action = useAction(onShowToast);
  const [level, setLevel] = useState('L2');
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (project.data) {
      setLevel(project.data.automation_level || 'L2');
      setPaused(project.data.is_paused || false);
    }
  }, [project.data]);

  return (
    <Page
      id="view-settings"
      title="系统设置"
      description="配置项目治理级别、任务巡检自动化调度与底层大模型接入。对外发布始终受严格人工签字约束；暂停后后台 Worker 将停止领单。"
    >
      <div className="section-grid" style={{ marginBottom: '20px' }}>
        {/* Left Column: Project Governance Level */}
        <article className="card panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">项目治理与自动化级别</h2>
              <div className="panel-sub">控制闭环自动执行的自主权与审批阈值</div>
            </div>
          </div>

          <ResourceState resource={project} />

          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(
                () => api.updateProjectSettings({ automation_level: level, is_paused: paused }),
                '项目治理设置已成功保存'
              );
            }}
          >
            <div className="form-group">
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                自动化自治等级 (Automation Level)
              </label>
              <select
                className="select"
                style={{ width: '100%' }}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option value="L1">L1 · 手动运行（全流程均需人工手动触发）</option>
                <option value="L2">L2 · 推荐：自动监测巡检、生成与策略人工审批</option>
                <option value="L3">L3 · 深度自治：自动巡检与自进化，仅对外发布需签字</option>
              </select>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: paused ? '#fef2f2' : '#f8fafc',
              }}
            >
              <input
                type="checkbox"
                id="pauseToggle"
                checked={paused}
                onChange={(e) => setPaused(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label
                htmlFor="pauseToggle"
                style={{ fontSize: '12px', fontWeight: 600, color: paused ? '#b91c1c' : '#334155', cursor: 'pointer' }}
              >
                暂停当前项目全部后台调度任务（Worker 将不再认领新任务）
              </label>
            </div>

            <button
              type="submit"
              className="btn primary"
              disabled={action.busy || !project.data}
              style={{ justifySelf: 'start', marginTop: '4px' }}
            >
              保存治理配置
            </button>
          </form>
        </article>

        {/* Right Column: Schedule Settings */}
        <article className="card panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">自动化监测调度</h2>
              <div className="panel-sub">定时拨测巡检计划与执行时段</div>
            </div>
          </div>

          <ResourceState resource={schedule} />

          <div style={{ display: 'grid', gap: '10px', fontSize: '13px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: '#f8fafc',
                borderRadius: '8px',
              }}
            >
              <span style={{ color: 'var(--muted)' }}>巡检执行周期</span>
              <b>{schedule.data?.frequency === 'daily' ? '每日巡检 (Daily)' : schedule.data?.frequency || '每日 08:00 & 20:00'}</b>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: '#f8fafc',
                borderRadius: '8px',
              }}
            >
              <span style={{ color: 'var(--muted)' }}>时间窗口 (Time Slot)</span>
              <b>{schedule.data?.time_slot || '今天 20:00'}</b>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: '#f8fafc',
                borderRadius: '8px',
              }}
            >
              <span style={{ color: 'var(--muted)' }}>下次预计触发</span>
              <b style={{ color: '#2563eb' }}>
                {schedule.data?.next_run_at ? new Date(schedule.data.next_run_at).toLocaleString() : '今天 20:00:00'}
              </b>
            </div>

            <div
              style={{
                marginTop: '4px',
                padding: '10px',
                borderRadius: '8px',
                background: '#eff6ff',
                color: '#1d4ed8',
                fontSize: '11px',
                lineHeight: 1.5,
              }}
            >
              💡 快捷调度提示：您可以在任意页面按下 <code>Cmd+K</code> 唤出运营副驾驶，直接下达指令（如“把每日定时拨测改成早上 9 点跑”）快速变更调度并预览。
            </div>
          </div>
        </article>
      </div>

      {/* AI LLM & Copilot Protocol Settings */}
      <AIConfigSection onShowToast={onShowToast} />
    </Page>
  );
}

const AIConfigSection: React.FC<{ onShowToast: (title: string, note?: string) => void }> = ({
  onShowToast,
}) => {
  const [provider, setProvider] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [maskedKey, setMaskedKey] = useState('');
  const [modelName, setModelName] = useState('deepseek-chat');
  const [temperature, setTemperature] = useState(0.3);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  React.useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const cfg = await api.getAIConfig();
      if (cfg) {
        setProvider(cfg.provider || 'deepseek');
        setBaseUrl(cfg.base_url || 'https://api.deepseek.com/v1');
        setModelName(cfg.model_name || 'deepseek-chat');
        setTemperature(cfg.temperature ?? 0.3);
        setMaskedKey(cfg.masked_key || '');
      }
    } catch {
      // Keep defaults
    }
  };

  const applyPreset = (name: string, url: string, model: string) => {
    setProvider(name);
    setBaseUrl(url);
    setModelName(model);
    setTestResult(null);
  };

  const handleSave = async () => {
    try {
      await api.updateAIConfig({
        provider,
        base_url: baseUrl,
        api_key: apiKey.trim() || undefined,
        model_name: modelName,
        temperature,
      });
      onShowToast('大模型配置已保存', `当前模型：${modelName}`);
      loadConfig();
      setApiKey('');
    } catch (err: any) {
      onShowToast('保存配置失败', err.message);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (apiKey.trim()) {
        await api.updateAIConfig({
          provider,
          base_url: baseUrl,
          api_key: apiKey.trim(),
          model_name: modelName,
          temperature,
        });
      }
      const res = await api.testAIConfig();
      setTestResult(res);
      if (res.success) {
        onShowToast('模型连通测试成功', res.message);
      } else {
        onShowToast('模型连通测试未通过', res.message);
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || '测试异常' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <article className="card panel" style={{ marginTop: '20px' }}>
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✨</span>
            <span>AI 大模型与智能副驾驶引擎配置 (OpenAI 协议兼容)</span>
          </h2>
          <div className="panel-sub">
            支持无缝接入国产大模型（DeepSeek、阿里通义千问、Kimi 等）与 OpenAI 兼容端点，驱动 LangGraph 状态机与智能副驾驶。
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn"
            disabled={testing}
            onClick={handleTest}
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            {testing ? '正在测试...' : '测试连通性'}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={handleSave}
            style={{ fontSize: '12px', padding: '6px 16px' }}
          >
            保存模型配置
          </button>
        </div>
      </div>

      {/* Provider Quick Presets */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => applyPreset('deepseek', 'https://api.deepseek.com/v1', 'deepseek-chat')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '8px',
            border: provider === 'deepseek' ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
            backgroundColor: provider === 'deepseek' ? '#0f172a' : '#ffffff',
            color: provider === 'deepseek' ? '#ffffff' : '#334155',
            fontWeight: provider === 'deepseek' ? 600 : 500,
            cursor: 'pointer',
          }}
        >
          <BrandIcon name="deepseek" size={15} color={provider === 'deepseek' ? '#ffffff' : '#1e50ff'} />
          <span>DeepSeek</span>
        </button>
        <button
          type="button"
          onClick={() =>
            applyPreset('qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-plus')
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '8px',
            border: provider === 'qwen' ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
            backgroundColor: provider === 'qwen' ? '#0f172a' : '#ffffff',
            color: provider === 'qwen' ? '#ffffff' : '#334155',
            fontWeight: provider === 'qwen' ? 600 : 500,
            cursor: 'pointer',
          }}
        >
          <BrandIcon name="qwen" size={15} color={provider === 'qwen' ? '#ffffff' : '#665cee'} />
          <span>通义千问 (Qwen)</span>
        </button>
        <button
          type="button"
          onClick={() => applyPreset('moonshot', 'https://api.moonshot.cn/v1', 'moonshot-v1-8k')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '8px',
            border: provider === 'moonshot' ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
            backgroundColor: provider === 'moonshot' ? '#0f172a' : '#ffffff',
            color: provider === 'moonshot' ? '#ffffff' : '#334155',
            fontWeight: provider === 'moonshot' ? 600 : 500,
            cursor: 'pointer',
          }}
        >
          <BrandIcon name="kimi" size={15} color={provider === 'moonshot' ? '#ffffff' : '#1f242d'} />
          <span>Kimi (月之暗面)</span>
        </button>
        <button
          type="button"
          onClick={() => applyPreset('openai', 'https://api.openai.com/v1', 'gpt-4o')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '8px',
            border: provider === 'openai' ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
            backgroundColor: provider === 'openai' ? '#0f172a' : '#ffffff',
            color: provider === 'openai' ? '#ffffff' : '#334155',
            fontWeight: provider === 'openai' ? 600 : 500,
            cursor: 'pointer',
          }}
        >
          <BrandIcon name="chatgpt" size={15} color={provider === 'openai' ? '#ffffff' : '#10a37f'} />
          <span>OpenAI (GPT-4o)</span>
        </button>
        <button
          type="button"
          onClick={() => applyPreset('claude', 'https://api.anthropic.com/v1', 'claude-3-5-sonnet-20241022')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '8px',
            border: provider === 'claude' ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
            backgroundColor: provider === 'claude' ? '#0f172a' : '#ffffff',
            color: provider === 'claude' ? '#ffffff' : '#334155',
            fontWeight: provider === 'claude' ? 600 : 500,
            cursor: 'pointer',
          }}
        >
          <BrandIcon name="claude" size={15} color={provider === 'claude' ? '#ffffff' : '#cc785c'} />
          <span>Anthropic (Claude)</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div className="form-group">
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467', marginBottom: '4px' }}>
            API 基础地址 (Base URL)
          </label>
          <input
            className="field"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="例如 https://api.deepseek.com/v1"
          />
        </div>

        <div className="form-group">
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467', marginBottom: '4px' }}>
            API 密钥 (API Key)
            {maskedKey && (
              <span style={{ marginLeft: '8px', color: '#64748b', fontSize: '11px', fontWeight: 400 }}>
                当前已配置：{maskedKey}
              </span>
            )}
          </label>
          <input
            className="field"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={maskedKey ? '若不修改密钥请留空' : '输入大模型 API Key (如 sk-...)'}
          />
        </div>

        <div className="form-group">
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467', marginBottom: '4px' }}>
            模型标识 (Model Name)
          </label>
          <input
            className="field"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="例如 deepseek-chat 或 qwen-plus"
          />
        </div>

        <div className="form-group">
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467', marginBottom: '4px' }}>
            发散度 (Temperature)：{temperature}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            style={{ width: '100%', height: '6px', marginTop: '8px' }}
          />
        </div>
      </div>

      {testResult && (
        <div
          style={{
            marginTop: '16px',
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: testResult.success ? '#ecfdf5' : '#fef2f2',
            border: testResult.success ? '1px solid #a7f3d0' : '1px solid #fecaca',
            color: testResult.success ? '#065f46' : '#991b1b',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>{testResult.success ? '✅' : '❌'}</span>
          <span>{testResult.message}</span>
        </div>
      )}
    </article>
  );
};

export default SettingsView;
