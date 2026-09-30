import { useState } from 'react';
import { api } from '../../services/api';
import { Page, ResourceState, useResource } from '../../components/ui/Resource';

interface Props {
  onShowToast: (title: string, note?: string) => void;
  onOpenModal: (title: string) => void;
}

export function StrategyView({ onOpenModal, onShowToast }: Props) {
  const resource = useResource(api.getStrategies);
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');

  const strategies = resource.data?.items || [];

  return (
    <Page
      id="view-strategy"
      title="策略编排"
      description="将诊断机会转为可审批、可追踪、可复测的自动化任务。编排任务跨越机会池、内容生产、审核发布与复测归因全闭环工序。"
      actions={
        <button
          type="button"
          className="btn primary"
          onClick={() => onOpenModal('创建策略任务')}
        >
          ＋ 新建策略
        </button>
      }
    >
      {/* Kanban Toolbar */}
      <div className="toolbar">
        <select
          className="select"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        >
          <option value="all">全部优先级</option>
          <option value="P0">P0 (紧急必做)</option>
          <option value="P1">P1 (高潜推进)</option>
          <option value="P2">P2 (常规补充)</option>
        </select>

        <select
          className="select"
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
        >
          <option value="all">全部执行者</option>
          <option value="agent">🤖 策略工作流 (AI Agent)</option>
          <option value="content">✍️ 内容团队</option>
          <option value="reviewer">🛡️ 品牌合规审核</option>
        </select>

        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: '13px' }}>
          共 {strategies.length > 0 ? strategies.length + 8 : 18} 个编排任务 · 本周预计闭环 11 项
        </span>
      </div>

      <ResourceState resource={resource} />

      {/* 4-Column Professional Kanban Board */}
      <div className="kanban">
        {/* Column 1: 机会池 */}
        <div className="kanban-col">
          <div className="kanban-head">
            <span>机会池 (Backlog)</span>
            <span className="count">{strategies.filter((s) => s.status === 'draft').length + 3}</span>
          </div>

          {/* Real API Strategies with status === 'draft' */}
          {strategies
            .filter((s) => s.status === 'draft' || !s.status)
            .map((s) => (
              <div className="kanban-card" key={s.id}>
                <span className="tag red">P0</span>
                <h4>{s.title}</h4>
                <p>{s.objective || '尚未明确优化目标'}</p>
                <div className="kanban-meta">
                  <span className="agent">
                    <i>🤖</i>
                    {s.assignee || '策略 Agent'}
                  </span>
                  <span>新建排队</span>
                </div>
              </div>
            ))}

          <div className="kanban-card">
            <span className="tag red">P0</span>
            <h4>武汉家政品牌对比内容集群</h4>
            <p>覆盖 16 个高商业意图问题，补齐竞品在主要大模型回答中的领先主题。</p>
            <div className="kanban-meta">
              <span className="agent">
                <i>策</i>策略工作流
              </span>
              <span>预估 +9.6</span>
            </div>
          </div>

          <div className="kanban-card">
            <span className="tag amber">P1</span>
            <h4>建立服务价格透明知识图谱</h4>
            <p>统一全网价格区间、增项细则和城市差异事实。</p>
            <div className="kanban-meta">
              <span className="agent">
                <i>策</i>策略工作流
              </span>
              <span>预估 +7.8</span>
            </div>
          </div>

          <div className="kanban-card">
            <span className="tag blue">P2</span>
            <h4>整理 20 个真实客户问答 FAQ</h4>
            <p>从售前客服真实高频会话提炼结构化事实问答。</p>
            <div className="kanban-meta">
              <span className="agent">
                <i>小</i>增长小林
              </span>
              <span>待派发</span>
            </div>
          </div>
        </div>

        {/* Column 2: 内容生产 */}
        <div className="kanban-col">
          <div className="kanban-head">
            <span>内容生产 (In Progress)</span>
            <span className="count">{strategies.filter((s) => s.status === 'in_progress').length + 3}</span>
          </div>

          {strategies
            .filter((s) => s.status === 'in_progress')
            .map((s) => (
              <div className="kanban-card" key={s.id}>
                <span className="tag amber">P1</span>
                <h4>{s.title}</h4>
                <p>{s.objective}</p>
                <div className="progress" style={{ marginTop: '10px' }}>
                  <span style={{ width: '65%' }}></span>
                </div>
                <div className="kanban-meta">
                  <span className="agent">
                    <i>文</i>{s.assignee || '内容 Agent'}
                  </span>
                  <span>生产中</span>
                </div>
              </div>
            ))}

          <div className="kanban-card">
            <span className="tag red">P0</span>
            <h4>开荒保洁验收 10 项标准指南</h4>
            <p>正在由生成引擎基于行业事实库草拟初稿与第三方引用证据清单。</p>
            <div className="progress" style={{ marginTop: '10px' }}>
              <span style={{ width: '72%' }}></span>
            </div>
            <div className="kanban-meta">
              <span className="agent">
                <i>文</i>内容工作流
              </span>
              <span>72%</span>
            </div>
          </div>

          <div className="kanban-card">
            <span className="tag amber">P1</span>
            <h4>家庭深度保洁收费标准细则说明</h4>
            <p>已自动对齐 6 个内部可信事实来源，待校验句级声明证据。</p>
            <div className="kanban-meta">
              <span className="agent">
                <i>文</i>内容工作流
              </span>
              <span>进行中</span>
            </div>
          </div>
        </div>

        {/* Column 3: 审核发布 */}
        <div className="kanban-col">
          <div className="kanban-head">
            <span>审核发布 (Review)</span>
            <span className="count">2</span>
          </div>

          <div className="kanban-card">
            <span className="tag purple">待品牌审核</span>
            <h4>家政保洁避坑与挑选须知</h4>
            <p>事实校验已 100% 通过，文内含 3 处服务承诺需要人工复核授权。</p>
            <div className="kanban-meta">
              <span className="agent">
                <i>周</i>周合规
              </span>
              <span>待签署</span>
            </div>
            <button
              type="button"
              className="btn small primary"
              style={{ width: '100%', marginTop: '10px' }}
              onClick={() => onShowToast('审核工作台', '已定位至待核验内容草稿')}
            >
              立即核验
            </button>
          </div>

          <div className="kanban-card">
            <span className="tag green">审核通过</span>
            <h4>空调清洗全流程拆解与收费标准</h4>
            <p>已通过事实核验，排队通过 Webhook 渠道同步投递至官网与知乎。</p>
            <div className="kanban-meta">
              <span className="agent">
                <i>发</i>分发工作流
              </span>
              <span>准备投递</span>
            </div>
          </div>
        </div>

        {/* Column 4: 复测归因 */}
        <div className="kanban-col">
          <div className="kanban-head">
            <span>复测归因 (Live & Retest)</span>
            <span className="count">3</span>
          </div>

          <div className="kanban-card">
            <span className="tag green">提升明显</span>
            <h4>保洁阿姨怎么选不踩坑？</h4>
            <p>发布 14 天后复测：5 个大模型引擎总覆盖率从 20% 显著提升至 80%。</p>
            <div className="kanban-meta">
              <span style={{ color: '#16a34a', fontWeight: 700 }}>声量 +12.4%</span>
              <span className="tag green">已归因</span>
            </div>
          </div>

          <div className="kanban-card">
            <span className="tag amber">观察周期中</span>
            <h4>武汉钟点工收费行情参考</h4>
            <p>已在 DeepSeek 和豆包出现 2 次新增证据引用，等待完成 7 日周期复测。</p>
            <div className="kanban-meta">
              <span>第 4 / 7 天</span>
              <span style={{ color: '#2563eb' }}>+3.1%</span>
            </div>
          </div>

          <div className="kanban-card">
            <span className="tag gray">归档沉淀</span>
            <h4>育儿嫂面试常见专业考题</h4>
            <p>已沉淀为全局可复用规则，长期提供稳定正向品牌引用。</p>
            <div className="kanban-meta">
              <span>已固化规则</span>
              <span>稳定</span>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

export default StrategyView;
