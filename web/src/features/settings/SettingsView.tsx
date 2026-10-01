import { useState, useEffect } from 'react';
import { usePermissions } from '../../hooks/permissions';
import { PermissionButton } from '../../components/ui/Permissions';
import { BrandIcon } from '../../components/common/BrandIcon';
import { api } from '../../services/api';
import { Page, ResourceState } from '../../components/ui/Resource';
import { useResource } from '../../hooks/useResource';
import { useAction } from '../../hooks/useAction';
import {
  ShieldCheck,
  Activity,
  Sparkles,
  Server,
  Clock,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Check,
} from 'lucide-react';

interface SettingsViewProps {
  onShowToast: (title: string, note?: string) => void;
}

export function SettingsView({ onShowToast }: SettingsViewProps) {
  const permissions = usePermissions();
  const health = useResource(api.getSystemStatus, 5000, permissions.admin);
  const project = useResource(api.getProject);
  const schedule = useResource(api.getSchedule);
  const action = useAction(onShowToast);

  // Active Tab: 'governance' | 'ai_engine' | 'health'
  const [activeTab, setActiveTab] = useState<'governance' | 'ai_engine' | 'health'>('governance');

  // Governance State
  const [levelDraft, setLevel] = useState<string | null>(null);
  const [pausedDraft, setPaused] = useState<boolean | null>(null);
  const level = levelDraft ?? project.data?.automation_level ?? 'L2';
  const paused = pausedDraft ?? project.data?.is_paused ?? false;

  // AI Config State
  const [provider, setProvider] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [maskedKey, setMaskedKey] = useState('');
  const [modelName, setModelName] = useState('deepseek-chat');
  const [temperature, setTemperature] = useState(0.3);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    loadAIConfig();
  }, []);

  async function loadAIConfig() {
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
  }

  const applyPreset = (name: string, url: string, model: string) => {
    setProvider(name);
    setBaseUrl(url);
    setModelName(model);
    setTestResult(null);
  };

  const handleSaveAI = async () => {
    try {
      await api.updateAIConfig({
        provider,
        base_url: baseUrl,
        api_key: apiKey.trim() || undefined,
        model_name: modelName,
        temperature,
      });
      onShowToast('大模型配置已保存', `当前模型：${modelName}`);
      void loadAIConfig();
      setApiKey('');
    } catch (err: any) {
      onShowToast('保存配置失败', err.message);
    }
  };

  const handleTestAI = async () => {
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
      setTestResult({
        success: false,
        message: err.message || '测试异常',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Page
      id="view-settings"
      title="系统设置"
      description="配置项目治理级别、任务巡检自动化调度与底层大模型接入。对外发布始终受严格人工签字约束；暂停后后台 Worker 将停止领单。"
    >
      {/* ========================================================= */}
      {/* 1. Top Executive Metric Cards (4 KPI Cards)                */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* Card 1: 自动化自治等级 */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>自治治理等级</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <ShieldCheck size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {level === 'L1' ? 'L1 · 手动运行' : level === 'L3' ? 'L3 · 深度自治' : 'L2 · 推荐模式'}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            {level === 'L1' ? '全流程需人工触发' : level === 'L3' ? '仅对外发布需要签字' : '监测自动，生成与策略需审批'}
          </div>
        </div>

        {/* Card 2: 后台调度状态 */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>Worker 调度状态</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: paused ? '#fef2f2' : '#ecfdf5',
                color: paused ? '#e11d48' : '#059669',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Activity size={17} />
            </div>
          </div>
          <div
            style={{
              fontSize: '26px',
              fontWeight: 800,
              color: paused ? '#b91c1c' : '#047857',
              margin: '8px 0 3px',
              letterSpacing: '-0.02em',
            }}
          >
            {paused ? '已暂停调度' : '正常轮询中'}
          </div>
          <div style={{ fontSize: '11.5px', color: paused ? '#b91c1c' : '#059669', fontWeight: 500 }}>
            {paused ? '后台 Worker 停止认领新任务' : '自动化拨测与巡检正常执行'}
          </div>
        </div>

        {/* Card 3: 底层大模型 */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>底层接入大模型</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#faf5ff',
                color: '#7c3aed',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Sparkles size={17} />
            </div>
          </div>
          <div
            style={{
              fontSize: '26px',
              fontWeight: 800,
              color: '#0f172a',
              margin: '8px 0 3px',
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={modelName}
          >
            {modelName}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            OpenAI 协议兼容 · T={temperature}
          </div>
        </div>

        {/* Card 4: 系统健康审计 */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>系统架构健康度</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#f0fdf4',
                color: '#16a34a',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Server size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {health.data ? `v${health.data.schema_version}` : permissions.admin ? '在线' : '需 Admin'}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            {health.data
              ? `待核对: ${health.data.unknown_publications} · 过期租约: ${health.data.expired_leases}`
              : '安全权限受限或加载中'}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. Single Unified Card Container                           */}
      {/* ========================================================= */}
      <article
        className="card"
        style={{
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          background: '#ffffff',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
          overflow: 'hidden',
        }}
      >
        {/* Integrated Sub-tab Navigation */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #e2e8f0',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: '#f1f5f9',
              padding: '3px',
              borderRadius: '8px',
              gap: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('governance')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: activeTab === 'governance' ? 700 : 500,
                background: activeTab === 'governance' ? '#ffffff' : 'transparent',
                color: activeTab === 'governance' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'governance' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <ShieldCheck size={15} color={activeTab === 'governance' ? '#2563eb' : 'currentColor'} />
              <span>项目治理与调度</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ai_engine')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: activeTab === 'ai_engine' ? 700 : 500,
                background: activeTab === 'ai_engine' ? '#ffffff' : 'transparent',
                color: activeTab === 'ai_engine' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'ai_engine' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Sparkles size={15} color={activeTab === 'ai_engine' ? '#7c3aed' : 'currentColor'} />
              <span>AI 大模型引擎接入</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('health')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: activeTab === 'health' ? 700 : 500,
                background: activeTab === 'health' ? '#ffffff' : 'transparent',
                color: activeTab === 'health' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'health' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Server size={15} color={activeTab === 'health' ? '#059669' : 'currentColor'} />
              <span>系统健康与对账</span>
              {permissions.admin && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: '#e0e7ff',
                    color: '#4338ca',
                  }}
                >
                  Admin
                </span>
              )}
            </button>
          </div>

          <div style={{ fontSize: '12px', color: '#64748b' }}>
            当前环境受严格人机双锁与安全审计保护
          </div>
        </div>

        {/* Tab 1: 项目治理与自动化调度 */}
        {activeTab === 'governance' && (
          <div style={{ padding: '24px' }}>
            <ResourceState resource={project} />
            <ResourceState resource={schedule} />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: '24px',
              }}
            >
              {/* Left Column: Governance Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.run(
                    () =>
                      api.updateProjectSettings({
                        automation_level: level,
                        is_paused: paused,
                      }),
                    '项目治理设置已成功保存',
                  );
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px',
                    }}
                  >
                    <Sliders size={16} color="#2563eb" />
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                      自动化自治等级 (Automation Level)
                    </h3>
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px' }}>
                    控制系统自主权边界。对外正式发布始终受到严格人工审批签字约束。
                  </p>

                  {/* Level Cards Selector */}
                  <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
                    <div
                      onClick={() => setLevel('L1')}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: level === 'L1' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                        background: level === 'L1' ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: level === 'L1' ? '#1d4ed8' : '#0f172a' }}>
                          L1 · 手动运行模式
                        </span>
                        {level === 'L1' && <Check size={16} color="#2563eb" />}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                        全流程均需人工手动触发与确认。适用于系统冷启动期与极端保守的策略探索环境。
                      </div>
                    </div>

                    <div
                      onClick={() => setLevel('L2')}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: level === 'L2' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                        background: level === 'L2' ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: level === 'L2' ? '#1d4ed8' : '#0f172a' }}>
                            L2 · 推荐：人机协作自闭环
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              background: '#dbeafe',
                              color: '#1e40af',
                              padding: '1px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            推荐
                          </span>
                        </div>
                        {level === 'L2' && <Check size={16} color="#2563eb" />}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                        自动执行定时拨测巡检、策略生成与草稿撰写；策略落地与对外发布需人工签字确认。
                      </div>
                    </div>

                    <div
                      onClick={() => setLevel('L3')}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: level === 'L3' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                        background: level === 'L3' ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: level === 'L3' ? '#1d4ed8' : '#0f172a' }}>
                          L3 · 深度自治与自进化
                        </span>
                        {level === 'L3' && <Check size={16} color="#2563eb" />}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                        自动巡检、策略生成并驱动自进化规则自动更新；仅在对外正式发布触点保留签字审批。
                      </div>
                    </div>
                  </div>

                  {/* Accessible Select Dropdown */}
                  <select
                    id="settingsview-field-1"
                    className="select"
                    style={{ width: '100%', fontSize: '12.5px' }}
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                  >
                    <option value="L1">L1 · 手动运行（全流程均需人工手动触发）</option>
                    <option value="L2">L2 · 推荐：自动监测巡检、生成与策略人工审批</option>
                    <option value="L3">L3 · 深度自治：自动巡检与自进化，仅对外发布需签字</option>
                  </select>
                </div>

                {/* Worker Pause Switch */}
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: paused ? '1.5px solid #fecaca' : '1px solid #e2e8f0',
                    background: paused ? '#fef2f2' : '#f8fafc',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <input
                      type="checkbox"
                      id="pauseToggle"
                      checked={paused}
                      onChange={(e) => setPaused(e.target.checked)}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        marginTop: '2px',
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <label
                        htmlFor="pauseToggle"
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: paused ? '#991b1b' : '#1e293b',
                          cursor: 'pointer',
                          display: 'block',
                          marginBottom: '4px',
                        }}
                      >
                        暂停当前项目全部后台调度任务 (Emergency Halt)
                      </label>
                      <p
                        style={{
                          fontSize: '12px',
                          color: paused ? '#b91c1c' : '#64748b',
                          margin: 0,
                          lineHeight: 1.4,
                        }}
                      >
                        勾选后后台 Worker 将停止认领并执行任何拨测、巡检或策略任务，已在运行中的租约等待释放。
                      </p>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                  <PermissionButton
                    permission="admin"
                    type="submit"
                    className="btn primary"
                    disabled={action.busy || !project.data}
                    style={{
                      whiteSpace: 'nowrap',
                      padding: '8px 20px',
                      fontSize: '13px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <CheckCircle2 size={15} />
                    <span>保存治理配置</span>
                  </PermissionButton>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    更改立即生效，并记录到管理员审计日志
                  </span>
                </div>
              </form>

              {/* Right Column: Schedule Settings & Copilot Tip */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  borderLeft: '1px solid #f1f5f9',
                  paddingLeft: '24px',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px',
                    }}
                  >
                    <Clock size={16} color="#059669" />
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                      自动化巡检拨测调度
                    </h3>
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px' }}>
                    由后台 Cron 触发器驱动的无头监测服务，定期对目标渠道执行真实拨测。
                  </p>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: '10px',
                    fontSize: '13px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    <span style={{ color: '#64748b', fontSize: '12.5px' }}>巡检执行周期</span>
                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                      {schedule.data?.frequency === 'daily'
                        ? '每日巡检 (Daily)'
                        : schedule.data?.frequency || '每日 08:00 & 20:00'}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    <span style={{ color: '#64748b', fontSize: '12.5px' }}>时间窗口 (Time Slot)</span>
                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                      {schedule.data?.time_slot || '今天 20:00'}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    <span style={{ color: '#64748b', fontSize: '12.5px' }}>下次预计触发</span>
                    <span style={{ fontWeight: 700, color: '#2563eb', fontSize: '13px' }}>
                      {schedule.data?.next_run_at
                        ? new Date(schedule.data.next_run_at).toLocaleString()
                        : '今天 20:00:00'}
                    </span>
                  </div>
                </div>

                {/* Copilot Prompt Tip */}
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#166534',
                    fontSize: '12px',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>💡 快捷调度提示</span>
                  </div>
                  您可以在任意页面随时按下 <kbd style={{ padding: '2px 5px', background: '#ffffff', borderRadius: '4px', border: '1px solid #86efac', fontWeight: 600 }}>Cmd+K</kbd> 唤出运营智能副驾驶，直接下达指令（例如“将每日定时拨测时间改为早上 9 点”）即可快速预览并变更调度。
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: AI 大模型引擎接入 */}
        {activeTab === 'ai_engine' && (
          <div style={{ padding: '24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '18px',
              }}
            >
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="#7c3aed" />
                  <span>AI 大模型与智能副驾驶引擎配置 (OpenAI 协议兼容)</span>
                </h3>
                <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                  支持主流国产大模型（DeepSeek、通义千问、Kimi 等）与 OpenAI 兼容端点，驱动 LangGraph 状态机与智能副驾驶。
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <PermissionButton
                  permission="admin"
                  type="button"
                  className="btn"
                  disabled={testing}
                  onClick={handleTestAI}
                  style={{ fontSize: '12.5px', padding: '6px 14px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Play size={13} fill="currentColor" />
                  <span>{testing ? '正在测试...' : '测试连通性'}</span>
                </PermissionButton>
                <PermissionButton
                  permission="admin"
                  type="button"
                  className="btn primary"
                  onClick={handleSaveAI}
                  style={{ fontSize: '12.5px', padding: '6px 16px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCircle2 size={14} />
                  <span>保存模型配置</span>
                </PermissionButton>
              </div>
            </div>

            {/* Provider Quick Presets */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
                快速切换主流厂商预设：
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => applyPreset('deepseek', 'https://api.deepseek.com/v1', 'deepseek-chat')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '6px 14px',
                    fontSize: '12.5px',
                    borderRadius: '8px',
                    border: provider === 'deepseek' ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                    backgroundColor: provider === 'deepseek' ? '#0f172a' : '#ffffff',
                    color: provider === 'deepseek' ? '#ffffff' : '#334155',
                    fontWeight: provider === 'deepseek' ? 700 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <BrandIcon
                    name="deepseek"
                    size={15}
                    color={provider === 'deepseek' ? '#ffffff' : '#1e50ff'}
                  />
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
                    padding: '6px 14px',
                    fontSize: '12.5px',
                    borderRadius: '8px',
                    border: provider === 'qwen' ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                    backgroundColor: provider === 'qwen' ? '#0f172a' : '#ffffff',
                    color: provider === 'qwen' ? '#ffffff' : '#334155',
                    fontWeight: provider === 'qwen' ? 700 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
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
                    padding: '6px 14px',
                    fontSize: '12.5px',
                    borderRadius: '8px',
                    border: provider === 'moonshot' ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                    backgroundColor: provider === 'moonshot' ? '#0f172a' : '#ffffff',
                    color: provider === 'moonshot' ? '#ffffff' : '#334155',
                    fontWeight: provider === 'moonshot' ? 700 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <BrandIcon
                    name="kimi"
                    size={15}
                    color={provider === 'moonshot' ? '#ffffff' : '#1f242d'}
                  />
                  <span>Kimi (月之暗面)</span>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('openai', 'https://api.openai.com/v1', 'gpt-4o')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '6px 14px',
                    fontSize: '12.5px',
                    borderRadius: '8px',
                    border: provider === 'openai' ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                    backgroundColor: provider === 'openai' ? '#0f172a' : '#ffffff',
                    color: provider === 'openai' ? '#ffffff' : '#334155',
                    fontWeight: provider === 'openai' ? 700 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <BrandIcon
                    name="chatgpt"
                    size={15}
                    color={provider === 'openai' ? '#ffffff' : '#10a37f'}
                  />
                  <span>OpenAI (GPT-4o)</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    applyPreset('claude', 'https://api.anthropic.com/v1', 'claude-3-5-sonnet-20241022')
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '6px 14px',
                    fontSize: '12.5px',
                    borderRadius: '8px',
                    border: provider === 'claude' ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                    backgroundColor: provider === 'claude' ? '#0f172a' : '#ffffff',
                    color: provider === 'claude' ? '#ffffff' : '#334155',
                    fontWeight: provider === 'claude' ? 700 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <BrandIcon
                    name="claude"
                    size={15}
                    color={provider === 'claude' ? '#ffffff' : '#cc785c'}
                  />
                  <span>Anthropic (Claude)</span>
                </button>
              </div>
            </div>

            {/* Inputs Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px',
              }}
            >
              <div className="form-group">
                <label
                  htmlFor="settingsview-field-2"
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475467',
                    marginBottom: '4px',
                    display: 'block',
                  }}
                >
                  API 基础地址 (Base URL)
                </label>
                <input
                  id="settingsview-field-2"
                  className="field"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="例如 https://api.deepseek.com/v1"
                />
              </div>

              <div className="form-group">
                <label
                  htmlFor="settingsview-field-3"
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475467',
                    marginBottom: '4px',
                    display: 'block',
                  }}
                >
                  API 密钥 (API Key)
                  {maskedKey && (
                    <span
                      style={{
                        marginLeft: '8px',
                        color: '#64748b',
                        fontSize: '11px',
                        fontWeight: 400,
                      }}
                    >
                      当前已配置：{maskedKey}
                    </span>
                  )}
                </label>
                <input
                  id="settingsview-field-3"
                  className="field"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={maskedKey ? '若不修改密钥请留空' : '输入大模型 API Key (如 sk-...)'}
                />
              </div>

              <div className="form-group">
                <label
                  htmlFor="settingsview-field-4"
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475467',
                    marginBottom: '4px',
                    display: 'block',
                  }}
                >
                  模型标识 (Model Name)
                </label>
                <input
                  id="settingsview-field-4"
                  className="field"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="例如 deepseek-chat 或 qwen-plus"
                />
              </div>

              <div className="form-group">
                <label
                  htmlFor="settingsview-field-5"
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475467',
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>发散度 (Temperature)</span>
                  <span style={{ fontWeight: 700, color: '#2563eb' }}>{temperature}</span>
                </label>
                <input
                  id="settingsview-field-5"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    height: '6px',
                    marginTop: '8px',
                  }}
                />
              </div>
            </div>

            {/* Test Result Banner */}
            {testResult && (
              <div
                style={{
                  marginTop: '20px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  backgroundColor: testResult.success ? '#ecfdf5' : '#fef2f2',
                  border: testResult.success ? '1px solid #a7f3d0' : '1px solid #fecaca',
                  color: testResult.success ? '#065f46' : '#991b1b',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                {testResult.success ? (
                  <CheckCircle2 size={18} color="#059669" />
                ) : (
                  <AlertTriangle size={18} color="#e11d48" />
                )}
                <div style={{ flex: 1, fontWeight: 500 }}>{testResult.message}</div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: 系统健康与对账 (Admin 审计) */}
        {activeTab === 'health' && (
          <div style={{ padding: '24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Server size={18} color="#059669" />
                  <span>任务与回执底层健康状态</span>
                </h3>
                <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                  实时监控后台 Worker 租约超时、未知投递回执对账与数据库 Schema 版本。
                </p>
              </div>

              {permissions.admin && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void health.reload()}
                  style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                >
                  <RotateCcw size={13} />
                  <span>刷新健康度</span>
                </button>
              )}
            </div>

            {!permissions.admin ? (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                  fontSize: '13px',
                }}
              >
                <div style={{ marginBottom: '8px' }}>🔒</div>
                <b>需要系统管理员 (Admin) 权限</b>
                <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
                  当前账号暂无底层任务租约与数据库版本审计权限，请联系管理员分配权限。
                </p>
              </div>
            ) : (
              <>
                <ResourceState resource={health} />
                {health.data && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>过期租约 (Expired Leases)</span>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: health.data.expired_leases > 0 ? '#b91c1c' : '#0f172a', marginTop: '4px' }}>
                          {health.data.expired_leases}
                        </div>
                      </div>

                      <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>待核对发布 (Unknown Pubs)</span>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: health.data.unknown_publications > 0 ? '#d97706' : '#0f172a', marginTop: '4px' }}>
                          {health.data.unknown_publications}
                        </div>
                      </div>

                      <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>数据库 Schema 版本</span>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                          v{health.data.schema_version}
                        </div>
                      </div>

                      <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>最后观测时间</span>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginTop: '6px' }}>
                          {new Date(health.data.observed_at).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Jobs Queue Breakdown Table */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                        Worker 队列认领与运行概况
                      </div>
                      <div style={{ padding: '12px 14px' }}>
                        {health.data.jobs && health.data.jobs.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {health.data.jobs.map((j, idx) => (
                              <div
                                key={idx}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  background: '#f1f5f9',
                                  fontSize: '12px',
                                }}
                              >
                                <span style={{ color: '#475467', fontWeight: 500 }}>{j.status}</span>
                                <span style={{ fontWeight: 700, color: '#0f172a' }}>{j.count}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '12.5px', color: '#94a3b8' }}>暂无正在排队的任务</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </article>
    </Page>
  );
}

export default SettingsView;
