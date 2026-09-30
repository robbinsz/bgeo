import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { ThoughtChainCard } from './ThoughtChainCard';
import type { AgentExecutionStep } from '../../types';

afterEach(cleanup);

describe('ThoughtChainCard Component', () => {
  const mockSteps: AgentExecutionStep[] = [
    {
      step_id: 'step_1',
      step_type: 'memory_retrieval',
      title: '已批准上下文检索',
      description: '检索到 3 条已批准事实',
      duration_ms: 120,
      timestamp: '2026-09-30T12:00:00Z',
      status: 'success',
    },
    {
      step_id: 'step_2',
      step_type: 'tool_execution',
      title: 'get_geo_overview_and_gaps',
      description: '检索 GEO 整体诊断数据完成',
      duration_ms: 450,
      timestamp: '2026-09-30T12:00:01Z',
      status: 'success',
      details: {
        arguments: '{"limit": 5}',
        result: '品牌提及率 68%',
      },
    },
  ];

  it('renders collapsed capsule by default with step count', () => {
    const { container, queryByText } = render(
      <ThoughtChainCard steps={mockSteps} isRunning={false} />
    );

    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('已深度思考并调用工具');
    expect(button?.textContent).toContain('2 个步骤');
    expect(button?.textContent).toContain('1 次工具');

    // Timeline details should not be shown before clicking
    expect(queryByText('思维链与工具执行轨迹')).toBeNull();
  });

  it('expands to show timeline and steps when clicked', () => {
    const { container, getByText } = render(
      <ThoughtChainCard steps={mockSteps} isRunning={false} />
    );

    const toggleButton = container.querySelector('button')!;
    fireEvent.click(toggleButton);

    expect(getByText('思维链与工具执行轨迹')).not.toBeNull();
    expect(getByText('检索 GEO 整体诊断与竞品差距')).not.toBeNull();
    expect(getByText('检索到 3 条已批准事实')).not.toBeNull();
  });

  it('shows running state when isRunning is true and displays active tool', () => {
    const { container } = render(
      <ThoughtChainCard
        steps={mockSteps}
        isRunning={true}
        activeTool="run_monitor_batch"
      />
    );

    expect(container.textContent).toContain('正在调用工具');
    expect(container.textContent).toContain('触发关键词自动化拨测批次');
  });

  it('allows expanding tool arguments details in expanded view', () => {
    const { getByText } = render(
      <ThoughtChainCard steps={mockSteps} defaultExpanded={true} />
    );

    const detailBtn = getByText('查看工具入参与详情');
    expect(detailBtn).not.toBeNull();
    fireEvent.click(detailBtn);

    expect(getByText('收起入参与调用详情')).not.toBeNull();
  });
});
