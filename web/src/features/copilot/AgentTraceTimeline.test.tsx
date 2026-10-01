import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentTraceTimeline } from './AgentTraceTimeline';
import type { AgentExecutionTrace } from '../../types';

describe('AgentTraceTimeline Component', () => {
  const mockTrace: AgentExecutionTrace = {
    id: 'trace-101',
    project_id: 'proj-1',
    session_id: 'session-888',
    user_prompt: '请分析上周转化率异常波动并生成应对方案',
    model_name: 'deepseek-r1-70b',
    total_duration_ms: 3250,
    status: 'completed',
    created_at: '2026-10-01T10:00:00Z',
    timeline_json: JSON.stringify([
      {
        step_id: 'step-1',
        step_type: 'memory_retrieval',
        title: '检索长期情境记忆与行业上下文',
        description: '检索到 3 条向量记忆与转化率告警历史',
        duration_ms: 210,
        timestamp: '2026-10-01T10:00:00Z',
        status: 'success',
        details: { top_k: 3, memory_type: 'episodic' },
      },
      {
        step_id: 'step-2',
        step_type: 'skill_assembly',
        title: '动态挂载专业技能 (Skill Assembly)',
        description: '激活了 conversion-audit 与 funnel-analyzer 技能包',
        duration_ms: 140,
        timestamp: '2026-10-01T10:00:00.210Z',
        status: 'success',
        details: { skills: ['conversion-audit', 'funnel-analyzer'] },
      },
      {
        step_id: 'step-3',
        step_type: 'model_inference',
        title: '大模型思维链规划与推理 (Model Inference)',
        description: '模型思考了 1.8 秒，规划了先查漏斗后调指标的分析路径',
        duration_ms: 1800,
        timestamp: '2026-10-01T10:00:00.350Z',
        status: 'success',
        details: { token_count: 512 },
      },
      {
        step_id: 'step-4',
        step_type: 'mcp_invocation',
        title: '调用远程 MCP 协议服务 (analytics-mcp)',
        description: '通过 streamable_http 协议向 MCP 网关请求漏斗归因数据',
        duration_ms: 620,
        timestamp: '2026-10-01T10:00:02.150Z',
        status: 'success',
        details: {
          mcp_server: 'analytics-mcp',
          transport_type: 'streamable_http',
          protocol_method: 'tools/call',
        },
      },
      {
        step_id: 'step-5',
        step_type: 'tool_execution',
        title: '执行本地安全沙箱工具 (metric_calculator)',
        description: '计算归因权重与方差波动阈值',
        duration_ms: 310,
        timestamp: '2026-10-01T10:00:02.770Z',
        status: 'success',
        details: { tool: 'metric_calculator' },
      },
      {
        step_id: 'step-6',
        step_type: 'post_session_hook',
        title: '执行后置反思钩子与记忆归档 (Post-Session Hook)',
        description: '沉淀漏斗异动结论至记忆向量库',
        duration_ms: 170,
        timestamp: '2026-10-01T10:00:03.080Z',
        status: 'success',
        details: { archived_items: 1 },
      },
    ]),
  };

  it('renders trace overview header with prompt, model and duration', () => {
    render(<AgentTraceTimeline trace={mockTrace} />);

    expect(screen.getByText(/请分析上周转化率异常波动并生成应对方案/)).toBeTruthy();
    expect(screen.getAllByText('deepseek-r1-70b').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3250/).length).toBeGreaterThan(0);
  });

  it('renders dynamic 6-stage lifecycle pipeline banner', () => {
    render(<AgentTraceTimeline trace={mockTrace} />);

    expect(screen.getAllByText('记忆加载').length).toBeGreaterThan(0);
    expect(screen.getAllByText('技能装配').length).toBeGreaterThan(0);
    expect(screen.getAllByText('状态机规划推演').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MCP协议 & 本地工具').length).toBeGreaterThan(0);
    expect(screen.getAllByText('安全审批管控').length).toBeGreaterThan(0);
    expect(screen.getAllByText('响应与反思Hook').length).toBeGreaterThan(0);
  });

  it('switches between timeline, graph topology, and raw JSON modes', () => {
    render(<AgentTraceTimeline trace={mockTrace} />);

    // Default is timeline
    expect(screen.getAllByText('检索长期情境记忆与行业上下文').length).toBeGreaterThan(0);

    // Switch to graph view
    const graphBtn = screen.getAllByText('流程拓扑')[0].closest('button')!;
    fireEvent.click(graphBtn);
    expect(screen.getByText('LangGraph 决策流向拓扑图谱')).toBeTruthy();

    // Switch to raw JSON view
    const jsonBtn = screen.getAllByText('Raw JSON')[0].closest('button')!;
    fireEvent.click(jsonBtn);
    expect(screen.getByText('完整时间线数据 (Raw JSON)')).toBeTruthy();
  });

  it('supports stage clicking to filter steps', () => {
    render(<AgentTraceTimeline trace={mockTrace} />);

    // Click on "MCP协议 & 本地工具" stage in pipeline banner
    const mcpStageElements = screen.getAllByText('MCP协议 & 本地工具');
    fireEvent.click(mcpStageElements[0]);

    // MCP step should be visible
    expect(screen.getAllByText('调用远程 MCP 协议服务 (analytics-mcp)').length).toBeGreaterThan(0);
  });

  it('triggers onClose and onOpenHarnessLogs callbacks when buttons clicked', () => {
    const handleClose = vi.fn();
    const handleOpenLogs = vi.fn();

    render(
      <AgentTraceTimeline
        trace={mockTrace}
        onClose={handleClose}
        onOpenHarnessLogs={handleOpenLogs}
      />
    );

    const closeBtn = screen.getByTitle('关闭');
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    const configBtn = screen.getByTitle('前往副驾驶装配与执行配置');
    fireEvent.click(configBtn);
    expect(handleOpenLogs).toHaveBeenCalledTimes(1);
  });
});
