import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Page, ResourceState, useResource, useAction } from '../../components/ui/Resource';

interface Props {
  onShowToast: (title: string, note?: string) => void;
}

export function HarnessConfigView({ onShowToast }: Props) {
  const config = useResource(api.getHarnessConfig);
  const servers = useResource(api.getMCPServers);
  const memories = useResource(api.getMemoryEntries);
  const skills = useResource(api.getCustomSkills);
  const traces = useResource(api.getAgentTraces);
  const action = useAction(onShowToast);

  const [enabled, setEnabled] = useState<string[]>([]);
  const [history, setHistory] = useState(10);
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [headers, setHeaders] = useState('');
  const [memoryTitle, setMemoryTitle] = useState('');
  const [memory, setMemory] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (config.data) {
      try {
        setEnabled(JSON.parse(config.data.enabled_skills));
      } catch {
        setEnabled([]);
      }
      setHistory(config.data.max_history_turns);
    }
  }, [config.data]);

  const serverList = servers.data?.items || [];
  const memoryList = memories.data?.items || [];
  const skillList = skills.data?.items || [];
  const traceList = traces.data?.items || [];

  return (
    <Page
      id="view-harness"
      title="Harness 副驾驶装配与执行配置"
      description="管理智能副驾驶的技能白名单、外部 MCP 工具服务、长期运营偏好记忆与底层执行 Trace。高危操作受严格审批管控。"
    >
      <div className="section-grid">
        {/* Left Column: Skills & MCP */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Capabilities form */}
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">已装载的 Agent 能力集</h2>
                <div className="panel-sub">勾选允许副驾驶在规划阶段调用的核心闭环技能</div>
              </div>
            </div>

            <ResourceState resource={config} />

            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(
                  () =>
                    api.updateHarnessConfig({
                      enabled_skills: JSON.stringify(enabled),
                      max_history_turns: history,
                    }),
                  'Harness 执行配置已成功保存'
                );
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                {[
                  ['monitor', '🔍 监测与调度'],
                  ['diagnosis', '🎯 差距诊断'],
                  ['content', '✍️ 内容生成与核验'],
                  ['publish', '🚀 渠道发布 (高危)'],
                  ['evolution', '🧬 自进化规则评估'],
                ].map(([id, label]) => (
                  <label
                    key={id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: enabled.includes(id) ? '#eff6ff' : '#f8fafc',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enabled.includes(id)}
                      onChange={(e) =>
                        setEnabled((current) =>
                          e.target.checked ? [...current, id] : current.filter((v) => v !== id)
                        )
                      }
                    />
                    <span style={{ fontWeight: enabled.includes(id) ? 600 : 400 }}>{label}</span>
                  </label>
                ))}
              </div>

              <div className="form-group" style={{ marginTop: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  对话上下文窗口保留轮数：{history} 轮
                </label>
                <input
                  type="number"
                  min={1}
                  max={40}
                  className="field"
                  value={history}
                  onChange={(e) => setHistory(Number(e.target.value))}
                />
              </div>

              <button
                type="submit"
                className="btn primary"
                disabled={action.busy || !config.data}
                style={{ justifySelf: 'start', marginTop: '4px' }}
              >
                保存执行配置
              </button>
            </form>
          </article>

          {/* External MCP Services */}
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">外部 MCP 协议服务</h2>
                <div className="panel-sub">接入支持 Model Context Protocol 的 Streamable HTTP 服务</div>
              </div>
            </div>

            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  await api.createMCPServer({
                    name,
                    endpoint_url: endpoint,
                    transport_type: 'streamable_http',
                    auth_headers: headers,
                    is_active: true,
                  });
                  setName('');
                  setEndpoint('');
                  setHeaders('');
                }, '外部 MCP 服务已成功注册');
              }}
            >
              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>服务名称</label>
                <input
                  className="field"
                  required
                  placeholder="例如：CRM 数据洞察 MCP"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  HTTPS Streamable HTTP 端点
                </label>
                <input
                  className="field"
                  type="url"
                  required
                  placeholder="https://mcp.internal.example.com/v1/stream"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  认证请求头 JSON (选填)
                </label>
                <textarea
                  className="field"
                  style={{ minHeight: '60px', padding: '8px' }}
                  placeholder='{"Authorization": "Bearer sec_..."}'
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn primary"
                disabled={action.busy}
                style={{ justifySelf: 'start' }}
              >
                ＋ 添加 MCP 服务
              </button>
            </form>

            <ResourceState resource={servers} empty={!serverList.length} emptyMessage="暂无外部 MCP 服务" />

            <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
              {serverList.map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <b style={{ fontSize: '13px', color: '#1e293b' }}>{s.name}</b>
                    <span className={`tag ${s.is_active ? 'green' : 'gray'}`}>
                      {s.is_active ? '在线启用' : '已停用'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
                    {s.endpoint_url} · {s.has_credentials ? '已加密凭证' : '无凭据'}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn small"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          const result = await api.pingMCPServer(s.id);
                          if (result.status !== 'online') throw new Error(result.error || '握手失败');
                          onShowToast('连接成功', `${result.tools_count} 个可用工具已就绪`);
                        }, 'MCP 协议握手成功')
                      }
                    >
                      测试连接
                    </button>
                    <button
                      type="button"
                      className="btn small"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(
                          () => api.updateMCPServer(s.id, { is_active: !s.is_active }),
                          '服务状态已更新'
                        )
                      }
                    >
                      {s.is_active ? '停用' : '启用'}
                    </button>
                    <button
                      type="button"
                      className="btn small danger"
                      disabled={action.busy}
                      onClick={() => void action.run(() => api.deleteMCPServer(s.id), 'MCP 服务已删除')}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        {/* Right Column: Memory & Traces */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Long-Term Memory */}
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">副驾驶长期运营记忆</h2>
                <div className="panel-sub">记录品牌特定偏好、行业行话与排斥短语</div>
              </div>
            </div>

            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  await api.createMemoryEntry({
                    memory_type: 'user_pref',
                    title: memoryTitle,
                    content: memory,
                  });
                  setMemoryTitle('');
                  setMemory('');
                }, '运营偏好记忆已录入');
              }}
            >
              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>偏好要点标题</label>
                <input
                  className="field"
                  required
                  placeholder="例如：回答中必须明确 24 小时售后质保政策"
                  value={memoryTitle}
                  onChange={(e) => setMemoryTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>偏好详细描述</label>
                <textarea
                  className="field"
                  required
                  style={{ minHeight: '60px', padding: '8px' }}
                  placeholder="只要涉及到开荒保洁，副驾驶必须强调全屋深度消杀作为标配服务..."
                  value={memory}
                  onChange={(e) => setMemory(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn primary"
                disabled={action.busy}
                style={{ justifySelf: 'start' }}
              >
                录入长期记忆
              </button>
            </form>

            <ResourceState resource={memories} empty={!memoryList.length} emptyMessage="暂无长期记忆条目" />

            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
              {memoryList.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <b style={{ fontSize: '13px', color: '#1e293b' }}>{m.title}</b>
                    <span className={`tag ${m.status === 'approved' ? 'green' : 'amber'}`}>
                      {m.status === 'approved' ? '已核准' : '待审批'}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0', fontSize: '12px', color: '#475467' }}>{m.content}</p>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
                    {m.status === 'pending' && m.memory_type !== 'brand_truth' && (
                      <button
                        type="button"
                        className="btn small primary"
                        disabled={action.busy}
                        onClick={() => void action.run(() => api.approveMemory(m.id), '偏好记忆已核准')}
                      >
                        ✓ 批准生效
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn small danger"
                      disabled={action.busy}
                      onClick={() => void action.run(() => api.deleteMemoryEntry(m.id), '记忆条目已删除')}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* Custom Skills ZIP Import */}
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">自定义技能包 (Custom Skills)</h2>
                <div className="panel-sub">导入包含 SKILL.md 的标准 ZIP 压缩包</div>
              </div>
            </div>

            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (file) void action.run(() => api.importCustomSkill(file), '技能包导入成功，待审核后启用');
              }}
            >
              <input
                type="file"
                accept=".zip"
                required
                className="field"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <button
                type="submit"
                className="btn primary"
                disabled={action.busy || !file}
                style={{ justifySelf: 'start' }}
              >
                上传并导入
              </button>
            </form>

            <ResourceState resource={skills} empty={!skillList.length} emptyMessage="暂无自定义技能" />

            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
              {skillList.map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <b style={{ fontSize: '13px', color: '#1e293b' }}>{s.name}</b>
                    <span className={`tag ${s.is_active ? 'green' : 'gray'}`}>
                      {s.is_active ? '已启用' : '待审核/停用'}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0', fontSize: '11px', color: 'var(--muted)' }}>{s.description}</p>
                  <button
                    type="button"
                    className="btn small"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(
                        () => api.toggleCustomSkill(s.id),
                        s.is_active ? '技能已停用' : '技能已启用'
                      )
                    }
                  >
                    {s.is_active ? '停用' : '审核并启用'}
                  </button>
                </div>
              ))}
            </div>
          </article>

          {/* Execution Traces */}
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">最近执行追踪 (Agent Traces)</h2>
                <div className="panel-sub">LangGraph 状态机决策链记录</div>
              </div>
            </div>

            <ResourceState resource={traces} empty={!traceList.length} emptyMessage="暂无执行追踪记录" />

            <div style={{ display: 'grid', gap: '6px' }}>
              {traceList.slice(0, 5).map((t) => (
                <details
                  key={t.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    background: '#f8fafc',
                    fontSize: '12px',
                  }}
                >
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                    <span className={`tag ${t.status === 'completed' ? 'green' : 'blue'}`} style={{ marginRight: '6px' }}>
                      {t.status}
                    </span>
                    <span>{t.user_prompt.slice(0, 24)}…</span>
                    <span style={{ float: 'right', color: 'var(--muted)', fontSize: '11px' }}>
                      {t.total_duration_ms}ms
                    </span>
                  </summary>
                  <pre
                    style={{
                      marginTop: '8px',
                      padding: '8px',
                      background: '#0f172a',
                      color: '#f8fafc',
                      borderRadius: '6px',
                      fontSize: '10px',
                      whiteSpace: 'pre-wrap',
                      overflowX: 'auto',
                    }}
                  >
                    {t.timeline_json}
                  </pre>
                </details>
              ))}
            </div>
          </article>
        </aside>
      </div>
    </Page>
  );
}

export default HarnessConfigView;
