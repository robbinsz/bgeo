import {BrandIcon} from '../../components/common/BrandIcon';
import React,{useEffect,useState} from 'react';import {api} from '../../services/api';import {Page,ResourceState,useResource,useAction} from '../../components/ui/Resource';
export function SettingsView({onShowToast}:{onShowToast:(title:string,note?:string)=>void}){const project=useResource(api.getProject);const schedule=useResource(api.getSchedule);const action=useAction(onShowToast);const [level,setLevel]=useState('L1');const [paused,setPaused]=useState(false);useEffect(()=>{if(project.data){setLevel(project.data.automation_level);setPaused(project.data.is_paused)}},[project.data]);return <Page title="系统设置" description="治理级别控制自动监测调度。对外发布始终需要人工审批；暂停后 Worker 不再领取本项目新任务。"><ResourceState resource={project}/><form className="card panel grid gap-3" onSubmit={e=>{e.preventDefault();void action.run(()=>api.updateProjectSettings({automation_level:level,is_paused:paused}),'项目设置已保存')}}><label>治理级别<select value={level} onChange={e=>setLevel(e.target.value)}><option value="L1">L1 手动运行</option><option value="L2">L2 自动监测、人工审批</option><option value="L3">L3 自动监测、人工审批发布</option></select></label><label><input type="checkbox" checked={paused} onChange={e=>setPaused(e.target.checked)}/>暂停项目任务</label><button className="btn primary" disabled={action.busy||!project.data}>保存设置</button></form><article className="card panel"><h2>监测调度</h2><ResourceState resource={schedule}/><p>{schedule.data?.frequency||'未配置'} · {schedule.data?.time_slot||'—'} · 下次：{schedule.data?.next_run_at||'—'}</p><p>可在副驾驶提出调度修改并审核预览。</p></article><AIConfigSection onShowToast={onShowToast}/></Page>}

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
      // If user typed a new key, save first
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
            <span>AI 大模型与 Copilot 接入配置 (OpenAI 协议兼容)</span>
          </h2>
          <div className="panel-sub">
            支持无缝接入国产大模型（DeepSeek、阿里通义千问、Kimi 等）与 OpenAI 兼容端点，驱动 LangGraph 状态图与智能副驾驶。
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn secondary"
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
          <label>API 基础地址 (Base URL)</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="例如 https://api.deepseek.com/v1"
          />
        </div>

        <div className="form-group">
          <label>
            API 密钥 (API Key)
            {maskedKey && (
              <span style={{ marginLeft: '8px', color: '#64748b', fontSize: '11px' }}>
                当前已配置：{maskedKey}
              </span>
            )}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={maskedKey ? '若不修改密钥请留空' : '输入大模型 API Key (如 sk-...)'}
          />
        </div>

        <div className="form-group">
          <label>模型标识 (Model Name)</label>
          <input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="例如 deepseek-chat 或 qwen-plus"
          />
        </div>

        <div className="form-group">
          <label>
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
