import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Sliders,
  Sparkles,
  Plug,
  Brain,
  RefreshCw,
  Plus,
  Search,
  Trash2,
  Edit3,
  Check,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Copy,
  ChevronDown,
  ChevronRight,
  Pin,
  Upload,
  CheckCheck,
  Zap,
  ExternalLink,
  Bot,
  SlidersHorizontal,
  ArrowRight,
  Shield,
  Layers3,
  Eye,
} from 'lucide-react';
import { usePagedResource } from '../../hooks/usePagedResource';
import { useResource } from '../../hooks/useResource';
import { useAction } from '../../hooks/useAction';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { PermissionButton } from '../../components/ui/Permissions';
import { Page, Pagination, ResourceState } from '../../components/ui/Resource';
import { MarkdownView } from '../../components/common/MarkdownView';
import { api, type MCPServer, type MemoryEntry, type CustomSkill } from '../../services/api';

interface Props {
  onShowToast: (title: string, note?: string) => void;
}

type TabKey = 'capabilities' | 'skills' | 'mcp' | 'memory';

interface BuiltinSkillMeta {
  id: string;
  name: string;
  desc: string;
  risk: 'safe' | 'high';
  category: string;
  tools: string[];
  iconBg: string;
  iconColor: string;
}

const BUILTIN_SKILLS: BuiltinSkillMeta[] = [
  {
    id: 'monitor',
    name: '全渠道监测与调度',
    desc: '巡检拨测、GEO 曝光能见度监控、异常指标告警与重试调度。',
    risk: 'safe',
    category: '基础监测',
    tools: ['probe_run', 'alert_eval', 'schedule_task'],
    iconBg: '#eff6ff',
    iconColor: '#2563eb',
  },
  {
    id: 'diagnosis',
    name: '竞品差距归因诊断',
    desc: '深度归因剖析、大模型引用来源落差比对、权威度缺失识别与优化机会挖掘。',
    risk: 'safe',
    category: '分析推演',
    tools: ['diagnose_gap', 'competitor_diff', 'opportunity_scan'],
    iconBg: '#f5f3ff',
    iconColor: '#7c3aed',
  },
  {
    id: 'content',
    name: 'AI 内容生成与事实核验',
    desc: '高权威内容自动生成、品牌基准事实核验（Fact-check）与合规质检评分。',
    risk: 'safe',
    category: '内容创作',
    tools: ['draft_generate', 'fact_verifier', 'quality_score'],
    iconBg: '#ecfdf5',
    iconColor: '#059669',
  },
  {
    id: 'publish',
    name: '全渠道自动化发布 (高危)',
    desc: '第三方自媒体渠道同步上架与外部系统写操作。受会话内人工审批门禁管控。',
    risk: 'high',
    category: '外部交互',
    tools: ['channel_publish', 'external_sync', 'asset_upload'],
    iconBg: '#fff1f2',
    iconColor: '#e11d48',
  },
  {
    id: 'evolution',
    name: '规则资产自进化评估',
    desc: '对话终态反思评估、成功策略切片沉淀、记忆向量归档与自演进规则生成。',
    risk: 'safe',
    category: '自我演进',
    tools: ['reflect_hook', 'extract_rule', 'evolve_asset'],
    iconBg: '#f0fdfa',
    iconColor: '#0d9488',
  },
];

const MEMORY_TYPE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  brand_truth: {
    label: '品牌基准事实',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
  },
  user_pref: {
    label: '运营与用户偏好',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
  },
  episodic_strategy: {
    label: '历史策略经验',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
  },
};

export function HarnessConfigView({ onShowToast }: Props) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('capabilities');

  // Resources
  const config = useResource(api.getHarnessConfig);
  const servers = usePagedResource(api.getMCPServers);
  const memories = usePagedResource(api.getMemoryEntries);
  const skills = usePagedResource(api.getCustomSkills);
  const action = useAction(onShowToast);

  // Copied indicator state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // -------------------------------------------------------------
  // TAB 1: Capabilities States
  // -------------------------------------------------------------
  const [enabledDraft, setEnabledDraft] = useState<string[] | null>(null);
  const [historyDraft, setHistoryDraft] = useState<number | null>(null);

  let savedSkills: string[] = [];
  try {
    const value: unknown = JSON.parse(config.data?.enabled_skills ?? '[]');
    if (Array.isArray(value)) {
      savedSkills = value.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    /* fallback to empty */
  }

  const enabled = enabledDraft ?? savedSkills;
  const history = historyDraft ?? config.data?.max_history_turns ?? 10;
  const isConfigDirty =
    (enabledDraft !== null && JSON.stringify(enabled.slice().sort()) !== JSON.stringify(savedSkills.slice().sort())) ||
    (historyDraft !== null && historyDraft !== (config.data?.max_history_turns ?? 10));

  // -------------------------------------------------------------
  // TAB 2: Skills States & Modals
  // -------------------------------------------------------------
  const [skillSearch, setSkillSearch] = useState('');
  const [isUploadSkillModalOpen, setIsUploadSkillModalOpen] = useState(false);
  const [skillZipFile, setSkillZipFile] = useState<File | null>(null);
  const [isSkillEditModalOpen, setIsSkillEditModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<CustomSkill | null>(null);
  const [previewingSkill, setPreviewingSkill] = useState<CustomSkill | null>(null);
  const [deletingSkill, setDeletingSkill] = useState<CustomSkill | null>(null);

  const skillList = skills.data?.items || [];
  const filteredSkills = useMemo(() => {
    if (!skillSearch.trim()) return skillList;
    const q = skillSearch.toLowerCase();
    return skillList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.skill_id.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)),
    );
  }, [skillList, skillSearch]);

  // -------------------------------------------------------------
  // TAB 3: MCP Servers States & Modals
  // -------------------------------------------------------------
  const [mcpSearch, setMcpSearch] = useState('');
  const [isMcpModalOpen, setIsMcpModalOpen] = useState(false);
  const [editingMcp, setEditingMcp] = useState<MCPServer | null>(null);
  const [deletingMcp, setDeletingMcp] = useState<MCPServer | null>(null);
  const [expandedMcpToolsId, setExpandedMcpToolsId] = useState<string | null>(null);

  const serverList = servers.data?.items || [];
  const filteredServers = useMemo(() => {
    if (!mcpSearch.trim()) return serverList;
    const q = mcpSearch.toLowerCase();
    return serverList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.endpoint_url.toLowerCase().includes(q),
    );
  }, [serverList, mcpSearch]);

  // -------------------------------------------------------------
  // TAB 4: Long-Term Memory States & Modals
  // -------------------------------------------------------------
  const [memoryTypeFilter, setMemoryTypeFilter] = useState<string>('all');
  const [memoryStatusFilter, setMemoryStatusFilter] = useState<'all' | 'approved' | 'pending'>('all');
  const [memorySearch, setMemorySearch] = useState('');
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<MemoryEntry | null>(null);
  const [deletingMemory, setDeletingMemory] = useState<MemoryEntry | null>(null);
  const [isHookTestModalOpen, setIsHookTestModalOpen] = useState(false);

  const memoryList = memories.data?.items || [];
  const filteredMemories = useMemo(() => {
    return memoryList.filter((m) => {
      if (memoryTypeFilter !== 'all' && m.memory_type !== memoryTypeFilter) return false;
      if (memoryStatusFilter !== 'all' && m.status !== memoryStatusFilter) return false;
      if (memorySearch.trim()) {
        const q = memorySearch.toLowerCase();
        const matchesTitle = m.title.toLowerCase().includes(q);
        const matchesContent = m.content.toLowerCase().includes(q);
        const matchesTags = m.tags && m.tags.toLowerCase().includes(q);
        if (!matchesTitle && !matchesContent && !matchesTags) return false;
      }
      return true;
    });
  }, [memoryList, memoryTypeFilter, memoryStatusFilter, memorySearch]);

  // Counts for tabs
  const enabledCount = enabled.length;
  const activeSkillsCount = skillList.filter((s) => s.is_active).length;
  const onlineMcpCount = serverList.filter((s) => s.is_active).length;
  const pendingMemoryCount = memoryList.filter((m) => m.status === 'pending').length;

  return (
    <Page
      id="view-harness"
      title="Harness 副驾驶装配与执行配置"
      description="管理智能副驾驶核心规划能力、外部扩展 Skill、MCP 协议网关与企业长期记忆沉淀。底层执行状态机受审计与高危安全隔离。"
    >
      {/* ========================================================= */}
      {/* Architecture Overview HUD (4 Key Metric Cards)            */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* Card 1: Capabilities */}
        <div
          onClick={() => setActiveTab('capabilities')}
          style={{
            background: activeTab === 'capabilities' ? '#f0fdf4' : '#ffffff',
            border: activeTab === 'capabilities' ? '1.5px solid #22c55e' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: activeTab === 'capabilities' ? '0 2px 8px rgba(34, 197, 94, 0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#dcfce7',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <SlidersHorizontal size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>核心能力装配</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', lineHeight: 1.2, marginTop: '2px' }}>
              {enabledCount} <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>/ 5 项</span>
            </div>
            <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '2px' }}>
              状态机闭环规划
            </div>
          </div>
        </div>

        {/* Card 2: Custom Skills */}
        <div
          onClick={() => setActiveTab('skills')}
          style={{
            background: activeTab === 'skills' ? '#faf5ff' : '#ffffff',
            border: activeTab === 'skills' ? '1.5px solid #a855f7' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: activeTab === 'skills' ? '0 2px 8px rgba(168, 85, 247, 0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#f3e8ff',
              color: '#9333ea',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>外挂扩展 Skill</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', lineHeight: 1.2, marginTop: '2px' }}>
              {activeSkillsCount} <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>/ {skillList.length} 套</span>
            </div>
            <div style={{ fontSize: '11px', color: '#9333ea', marginTop: '2px' }}>
              自定义意图拓展
            </div>
          </div>
        </div>

        {/* Card 3: MCP Servers */}
        <div
          onClick={() => setActiveTab('mcp')}
          style={{
            background: activeTab === 'mcp' ? '#f0fdfa' : '#ffffff',
            border: activeTab === 'mcp' ? '1.5px solid #14b8a6' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: activeTab === 'mcp' ? '0 2px 8px rgba(20, 184, 166, 0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#ccfbf1',
              color: '#0d9488',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Plug size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>外部 MCP 协议网关</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', lineHeight: 1.2, marginTop: '2px' }}>
              {onlineMcpCount} <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>/ {serverList.length} 在线</span>
            </div>
            <div style={{ fontSize: '11px', color: '#0d9488', marginTop: '2px' }}>
              标准工具协议对接
            </div>
          </div>
        </div>

        {/* Card 4: Long-Term Memory */}
        <div
          onClick={() => setActiveTab('memory')}
          style={{
            background: activeTab === 'memory' ? '#fffbeb' : '#ffffff',
            border: activeTab === 'memory' ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: activeTab === 'memory' ? '0 2px 8px rgba(245, 158, 11, 0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#fef3c7',
              color: '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Brain size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>企业长期情境记忆</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', lineHeight: 1.2, marginTop: '2px' }}>
              {memoryList.length} <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>条</span>
            </div>
            <div style={{ fontSize: '11px', color: '#d97706', marginTop: '2px' }}>
              {pendingMemoryCount > 0 ? `${pendingMemoryCount} 条待审核确认` : '知识偏好库完全同步'}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* Segmented Tab Navigation Bar                              */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: '20px',
          paddingBottom: '8px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div
          role="tablist"
          aria-label="Harness 配置面板导航"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#f1f5f9',
            padding: '4px',
            borderRadius: '10px',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'capabilities'}
            onClick={() => setActiveTab('capabilities')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: activeTab === 'capabilities' ? 600 : 500,
              color: activeTab === 'capabilities' ? '#0f172a' : '#64748b',
              background: activeTab === 'capabilities' ? '#ffffff' : 'transparent',
              boxShadow: activeTab === 'capabilities' ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Sliders size={15} color={activeTab === 'capabilities' ? '#2563eb' : '#64748b'} />
            <span>核心能力装配</span>
            <span
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '999px',
                background: activeTab === 'capabilities' ? '#dbeafe' : '#e2e8f0',
                color: activeTab === 'capabilities' ? '#1d4ed8' : '#64748b',
                fontWeight: 600,
              }}
            >
              {enabledCount}/5
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'skills'}
            onClick={() => setActiveTab('skills')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: activeTab === 'skills' ? 600 : 500,
              color: activeTab === 'skills' ? '#0f172a' : '#64748b',
              background: activeTab === 'skills' ? '#ffffff' : 'transparent',
              boxShadow: activeTab === 'skills' ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Sparkles size={15} color={activeTab === 'skills' ? '#7c3aed' : '#64748b'} />
            <span>Skill 技能中心</span>
            <span
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '999px',
                background: activeTab === 'skills' ? '#f3e8ff' : '#e2e8f0',
                color: activeTab === 'skills' ? '#7e22ce' : '#64748b',
                fontWeight: 600,
              }}
            >
              {activeSkillsCount}/{skillList.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'mcp'}
            onClick={() => setActiveTab('mcp')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: activeTab === 'mcp' ? 600 : 500,
              color: activeTab === 'mcp' ? '#0f172a' : '#64748b',
              background: activeTab === 'mcp' ? '#ffffff' : 'transparent',
              boxShadow: activeTab === 'mcp' ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Plug size={15} color={activeTab === 'mcp' ? '#059669' : '#64748b'} />
            <span>MCP 服务</span>
            <span
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '999px',
                background: activeTab === 'mcp' ? '#d1fae5' : '#e2e8f0',
                color: activeTab === 'mcp' ? '#047857' : '#64748b',
                fontWeight: 600,
              }}
            >
              {onlineMcpCount}/{serverList.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'memory'}
            onClick={() => setActiveTab('memory')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: activeTab === 'memory' ? 600 : 500,
              color: activeTab === 'memory' ? '#0f172a' : '#64748b',
              background: activeTab === 'memory' ? '#ffffff' : 'transparent',
              boxShadow: activeTab === 'memory' ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Brain size={15} color={activeTab === 'memory' ? '#d97706' : '#64748b'} />
            <span>长期记忆</span>
            <span
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '999px',
                background: pendingMemoryCount > 0 ? '#fef3c7' : '#e2e8f0',
                color: pendingMemoryCount > 0 ? '#b45309' : '#64748b',
                fontWeight: 600,
              }}
            >
              {memoryList.length} {pendingMemoryCount > 0 && `(${pendingMemoryCount}待审)`}
            </span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Direct link to dedicated Log Center */}
          <button
            type="button"
            className="btn small"
            onClick={() => navigate('/copilot/logs')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#334155',
              fontWeight: 500,
            }}
            title="前往独立的运营执行日志与执行时间线中心"
          >
            <Activity size={13} color="#2563eb" />
            <span>运营执行日志</span>
            <ExternalLink size={12} color="#94a3b8" />
          </button>

          <button
            type="button"
            className="btn small"
            onClick={() => {
              void config.reload();
              void skills.reload();
              void servers.reload();
              void memories.reload();
              onShowToast('配置已刷新', '所有板块最新数据已同步');
            }}
            title="刷新全部板块数据"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={13} className={config.loading ? 'animate-spin' : ''} />
            <span>全量刷新</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: 核心能力装配 (Capabilities & Architecture)         */}
      {/* ========================================================= */}
      {activeTab === 'capabilities' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Card 1: Runtime Architecture Blueprint Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              borderRadius: '12px',
              padding: '20px 24px',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              border: '1px solid #334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'rgba(59, 130, 246, 0.2)',
                    border: '1px solid rgba(96, 165, 250, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#60a5fa',
                  }}
                >
                  <Bot size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '-0.01em' }}>
                      GEOFlow 运营副驾驶执行框架
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: 'rgba(34, 197, 94, 0.2)',
                        color: '#4ade80',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        fontWeight: 600,
                      }}
                    >
                      Runtime v2.4 Active
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    基于 LangGraph 状态机决策引擎与 ReAct 闭环规划，支持动态工具编排、多级向量记忆与实时人工介入门禁
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/copilot/logs')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  color: '#f8fafc',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                }}
              >
                <Activity size={14} color="#60a5fa" />
                <span>进入执行日志中心</span>
                <ArrowRight size={14} />
              </button>
            </div>

            {/* Architecture Highlights Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                paddingTop: '12px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Cpu size={16} color="#60a5fa" />
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>基座推理引擎</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>DeepSeek-R1 / GPT-4o</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Layers3 size={16} color="#c084fc" />
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>规划推演架构</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>Plan & Solve + ReAct 状态机</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Brain size={16} color="#fbbf24" />
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>情境记忆注入</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>三层向量检索与偏好召回</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Shield size={16} color="#34d399" />
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>安全执行隔离</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>高危写入操作需人工二次确认</div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Core Capabilities Form & Interactive Cards */}
          <article className="card panel" style={{ padding: '24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    已装载的 Agent 能力集
                  </h2>
                  <span className="tag blue">{enabled.length} / 5 项已启用</span>
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  勾选允许副驾驶在自主规划 (Plan & Solve) 与状态机推演阶段调用的核心闭环技能
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => setEnabledDraft(BUILTIN_SKILLS.map((s) => s.id))}
                  title="启用全部 5 项能力"
                >
                  全选启用
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() =>
                    setEnabledDraft(
                      BUILTIN_SKILLS.filter((s) => s.risk !== 'high').map((s) => s.id),
                    )
                  }
                  title="启用非高危的标准推荐技能"
                >
                  推荐配置 (除高危)
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => setEnabledDraft([])}
                  title="禁用全部能力"
                >
                  全部清空
                </button>
              </div>
            </div>

            <ResourceState resource={config} />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(
                  () =>
                    api.updateHarnessConfig({
                      enabled_skills: JSON.stringify(enabled),
                      max_history_turns: history,
                    }),
                  'Harness 执行配置已成功持久化',
                ).then((ok) => {
                  if (ok) {
                    setEnabledDraft(null);
                    setHistoryDraft(null);
                  }
                });
              }}
            >
              {/* Capabilities Cards Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: '14px',
                  marginBottom: '24px',
                }}
              >
                {BUILTIN_SKILLS.map((skill) => {
                  const isChecked = enabled.includes(skill.id);
                  return (
                    <label
                      key={skill.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '16px',
                        borderRadius: '12px',
                        border: isChecked ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                        background: isChecked ? '#f8faff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: isChecked ? '0 4px 12px rgba(37,99,235,0.08)' : '0 1px 2px rgba(0,0,0,0.02)',
                        position: 'relative',
                      }}
                    >
                      <div>
                        {/* Header */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setEnabledDraft((prev) => {
                                  const base = prev ?? enabled;
                                  return checked ? [...base, skill.id] : base.filter((id) => id !== skill.id);
                                });
                              }}
                              style={{ width: '17px', height: '17px', cursor: 'pointer', accentColor: '#2563eb' }}
                            />
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '7px',
                                background: skill.iconBg,
                                color: skill.iconColor,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Zap size={15} />
                            </div>
                            <span style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>
                              {skill.name}
                            </span>
                          </div>

                          <span className={`tag ${skill.risk === 'high' ? 'red' : 'green'}`} style={{ fontSize: '11px' }}>
                            {skill.risk === 'high' ? '高危 · 需审批' : '安全能力'}
                          </span>
                        </div>

                        {/* Description */}
                        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                          {skill.desc}
                        </p>
                      </div>

                      {/* Footer with Tools Bundle */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: '10px',
                          borderTop: isChecked ? '1px solid #dbeafe' : '1px solid #f1f5f9',
                          flexWrap: 'wrap',
                          gap: '6px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#64748b',
                            background: '#f1f5f9',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {skill.category}
                        </span>

                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {skill.tools.map((t) => (
                            <code
                              key={t}
                              style={{
                                fontSize: '10px',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: isChecked ? '#eff6ff' : '#f8fafc',
                                color: isChecked ? '#1d4ed8' : '#64748b',
                                border: isChecked ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                              }}
                            >
                              {t}
                            </code>
                          ))}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Context History Window & Token Budget Planning */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '16px',
                  marginBottom: '20px',
                }}
              >
                {/* Left: Interactive Slider */}
                <div
                  style={{
                    padding: '18px',
                    borderRadius: '12px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <label
                        htmlFor="harness-history-slider"
                        style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}
                      >
                        上下文窗口保留轮数：
                        <span style={{ color: '#2563eb', fontWeight: 700, marginLeft: '4px' }}>
                          {history} 轮
                        </span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={40}
                        className="field"
                        style={{ width: '70px', textAlign: 'center', fontWeight: 600, height: '30px' }}
                        value={history}
                        onChange={(e) => setHistoryDraft(Math.min(40, Math.max(1, Number(e.target.value))))}
                      />
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      副驾驶推理时携带的历史往返对话轮次，直接影响规划深度与 Token 消耗
                    </div>
                  </div>

                  <input
                    id="harness-history-slider"
                    type="range"
                    min={1}
                    max={40}
                    step={1}
                    value={history}
                    onChange={(e) => setHistoryDraft(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer', margin: '8px 0' }}
                  />

                  {/* Preset quick buttons */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      { label: '极简 (5轮)', val: 5 },
                      { label: '标准推荐 (10轮)', val: 10 },
                      { label: '深度推演 (15轮)', val: 15 },
                      { label: '超长探索 (25轮)', val: 25 },
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => setHistoryDraft(p.val)}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: history === p.val ? '1px solid #2563eb' : '1px solid #cbd5e1',
                          background: history === p.val ? '#eff6ff' : '#ffffff',
                          color: history === p.val ? '#1d4ed8' : '#475569',
                          fontWeight: history === p.val ? 600 : 400,
                          cursor: 'pointer',
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right: Real-time Token Budget & Constraint Inspector */}
                <div
                  style={{
                    padding: '18px',
                    borderRadius: '12px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                      Token 预算与状态机约束分析
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: history <= 15 ? '#ecfdf5' : '#fffbeb',
                        color: history <= 15 ? '#059669' : '#b45309',
                        fontWeight: 600,
                      }}
                    >
                      {history <= 15 ? '预算安全' : '高消耗警告'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>预估上下文占用</div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#2563eb', marginTop: '2px' }}>
                        ~{Math.round(history * 1.8)}k <span style={{ fontSize: '11px', fontWeight: 400 }}>Tokens</span>
                      </div>
                    </div>
                    <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>单步思考预算</div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                        4,000 <span style={{ fontSize: '11px', fontWeight: 400 }}>Tokens</span>
                      </div>
                    </div>
                    <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>单会话硬上限</div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                        30,000 <span style={{ fontSize: '11px', fontWeight: 400 }}>Tokens</span>
                      </div>
                    </div>
                    <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>状态机最大跳数</div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                        25 <span style={{ fontSize: '11px', fontWeight: 400 }}>Steps</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>
                    严格遵从 Vibe Coding 准则第 6 条：单次任务硬上限 4,000 tokens，会话上限 30,000 tokens，避免无意义膨胀。
                  </div>
                </div>
              </div>

              {/* Dirty Banner & Save Actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  paddingTop: '8px',
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                {isConfigDirty ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#b45309',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}
                  >
                    <AlertCircle size={16} />
                    <span>检测到配置已修改，点击右侧按钮保存后副驾驶运行时即刻生效</span>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#059669',
                      fontSize: '13px',
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>配置与服务端已完全同步 (已启用 {enabled.length} 项能力 · 上下文 {history} 轮)</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  {isConfigDirty && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setEnabledDraft(null);
                        setHistoryDraft(null);
                      }}
                    >
                      放弃修改
                    </button>
                  )}
                  <PermissionButton
                    permission="admin"
                    type="submit"
                    className="btn primary"
                    disabled={action.busy || !config.data || !isConfigDirty}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Check size={14} />
                    <span>保存装配配置</span>
                  </PermissionButton>
                </div>
              </div>
            </form>
          </article>

          {/* Section: Dedicated Trace & Observability Link Card */}
          <div
            style={{
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              padding: '18px 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#dbeafe',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Activity size={20} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                  需要查看完整推演决策链与工具调用耗时剖析？
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  底层的 LangGraph 状态机决策链记录、MCP 工具执行详情及 40vw 执行时间线已整合至独立的「运营执行日志」模块。
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn"
              onClick={() => navigate('/copilot/logs')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#1e293b',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              <span>前往运营执行日志</span>
              <ArrowRight size={14} color="#2563eb" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: Skill 技能中心 (Skills Hub)                       */}
      {/* ========================================================= */}
      {activeTab === 'skills' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Skills Toolbar & Stats */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '16px 20px',
              borderRadius: '10px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
            }}
          >
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Skill 技能中心 (Custom Skills)
              </h2>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                标准 Agent 技能定义包（支持包含 SKILL.md 的标准 ZIP 压缩包或在线快速编写定义）
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  color="#94a3b8"
                  style={{ position: 'absolute', left: '10px', top: '10px' }}
                />
                <input
                  type="text"
                  placeholder="搜索技能名称或 ID…"
                  value={skillSearch}
                  onChange={(e) => setSkillSearch(e.target.value)}
                  className="field"
                  style={{ paddingLeft: '30px', width: '200px', height: '34px' }}
                />
              </div>

              <PermissionButton
                permission="admin"
                type="button"
                className="btn small"
                onClick={() => {
                  setSkillZipFile(null);
                  setIsUploadSkillModalOpen(true);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Upload size={13} />
                <span>导入 ZIP 技能包</span>
              </PermissionButton>

              <PermissionButton
                permission="admin"
                type="button"
                className="btn small primary"
                onClick={() => {
                  setEditingSkill(null);
                  setIsSkillEditModalOpen(true);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={13} />
                <span>新建技能</span>
              </PermissionButton>
            </div>
          </div>

          <ResourceState
            resource={skills}
            empty={!filteredSkills.length}
            emptyMessage={skillSearch ? '未找到符合条件的技能' : '暂无自定义技能包，可点击右上角导入或新建'}
          />

          {/* Skills Grid */}
          {filteredSkills.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '14px',
              }}
            >
              {filteredSkills.map((s) => {
                let fileList: string[] = [];
                try {
                  const parsed = JSON.parse(s.file_names || '[]');
                  if (Array.isArray(parsed)) fileList = parsed;
                } catch {
                  fileList = ['SKILL.md'];
                }

                return (
                  <div
                    key={s.id}
                    className="card"
                    style={{
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                            {s.name}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              color: '#64748b',
                              marginTop: '2px',
                            }}
                          >
                            ID: {s.skill_id}
                          </div>
                        </div>
                        <span className={`tag ${s.is_active ? 'green' : 'gray'}`}>
                          {s.is_active ? '在线生效' : '待审核/停用'}
                        </span>
                      </div>

                      <p
                        style={{
                          fontSize: '12px',
                          color: '#475467',
                          lineHeight: 1.5,
                          marginBottom: '10px',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {s.description || '暂无描述'}
                      </p>

                      {/* File labels */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '14px' }}>
                        {fileList.slice(0, 3).map((f) => (
                          <span
                            key={f}
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#f1f5f9',
                              color: '#475569',
                              fontFamily: 'monospace',
                            }}
                          >
                            {f}
                          </span>
                        ))}
                        {fileList.length > 3 && (
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                            +{fileList.length - 3} 个文件
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '1px solid #f1f5f9',
                        paddingTop: '10px',
                      }}
                    >
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => setPreviewingSkill(s)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Eye size={12} />
                        <span>定义预览</span>
                      </button>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <PermissionButton
                          permission="admin"
                          type="button"
                          className="btn small"
                          onClick={() => {
                            setEditingSkill(s);
                            setIsSkillEditModalOpen(true);
                          }}
                          title="编辑技能"
                        >
                          <Edit3 size={12} />
                        </PermissionButton>

                        <PermissionButton
                          permission="admin"
                          type="button"
                          className={`btn small ${s.is_active ? '' : 'primary'}`}
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(
                              () => api.toggleCustomSkill(s.id),
                              s.is_active ? '技能已停用' : '技能已启用生效',
                            )
                          }
                        >
                          {s.is_active ? '停用' : '启用'}
                        </PermissionButton>

                        <PermissionButton
                          permission="admin"
                          type="button"
                          className="btn small danger"
                          onClick={() => setDeletingSkill(s)}
                          title="删除技能"
                        >
                          <Trash2 size={12} />
                        </PermissionButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Pagination resource={skills} />
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: MCP 服务 (External MCP Services)                   */}
      {/* ========================================================= */}
      {activeTab === 'mcp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* MCP Toolbar & Stats */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '16px 20px',
              borderRadius: '10px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
            }}
          >
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                外部 MCP 协议服务 (Model Context Protocol)
              </h2>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                支持 Streamable HTTP / HTTP-SSE 传输协议，动态探测并挂载远程工具与数据源
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  color="#94a3b8"
                  style={{ position: 'absolute', left: '10px', top: '10px' }}
                />
                <input
                  type="text"
                  placeholder="搜索服务名称或 URL…"
                  value={mcpSearch}
                  onChange={(e) => setMcpSearch(e.target.value)}
                  className="field"
                  style={{ paddingLeft: '30px', width: '200px', height: '34px' }}
                />
              </div>

              <PermissionButton
                permission="admin"
                type="button"
                className="btn small primary"
                onClick={() => {
                  setEditingMcp(null);
                  setIsMcpModalOpen(true);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={13} />
                <span>注册 MCP 服务</span>
              </PermissionButton>
            </div>
          </div>

          <ResourceState
            resource={servers}
            empty={!filteredServers.length}
            emptyMessage={mcpSearch ? '未找到符合条件的 MCP 服务' : '暂无外部 MCP 协议服务，点击右上角快速注册'}
          />

          {/* MCP Server List */}
          {filteredServers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredServers.map((s) => {
                let cachedToolsList: Array<{ name: string; description?: string }> = [];
                try {
                  const parsed = JSON.parse(s.cached_tools || '[]');
                  if (Array.isArray(parsed)) cachedToolsList = parsed;
                } catch {
                  /* ignore */
                }
                const isToolsExpanded = expandedMcpToolsId === s.id;

                return (
                  <div
                    key={s.id}
                    className="card"
                    style={{
                      padding: '16px 18px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                            {s.name}
                          </span>
                          <span className={`tag ${s.is_active ? 'green' : 'gray'}`}>
                            {s.is_active ? '在线启用' : '已停用'}
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#f1f5f9',
                              color: '#475569',
                              fontFamily: 'monospace',
                            }}
                          >
                            {s.transport_type}
                          </span>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '12px',
                            color: '#64748b',
                            marginTop: '4px',
                            fontFamily: 'monospace',
                          }}
                        >
                          <span>{s.endpoint_url}</span>
                          <span>·</span>
                          <span>{s.has_credentials ? '🔒 已加密凭据' : '🔓 无凭据'}</span>
                          {s.last_ping_at && (
                            <>
                              <span>·</span>
                              <span>上次握手: {new Date(s.last_ping_at).toLocaleTimeString()}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Server Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <PermissionButton
                          permission="admin"
                          type="button"
                          className="btn small"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(async () => {
                              const result = await api.pingMCPServer(s.id);
                              if (result.status !== 'online') {
                                throw new Error(result.error || 'MCP 握手失败，服务离线');
                              }
                              onShowToast('连接测试成功', `协议握手正常，已就绪 ${result.tools_count ?? 0} 个可用工具`);
                            }, 'MCP 协议握手成功')
                          }
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Zap size={12} />
                          <span>测试连接</span>
                        </PermissionButton>

                        <PermissionButton
                          permission="admin"
                          type="button"
                          className="btn small"
                          onClick={() => {
                            setEditingMcp(s);
                            setIsMcpModalOpen(true);
                          }}
                          title="编辑配置"
                        >
                          <Edit3 size={12} />
                          <span>编辑</span>
                        </PermissionButton>

                        <PermissionButton
                          permission="admin"
                          type="button"
                          className="btn small"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(
                              () =>
                                api.updateMCPServer(s.id, {
                                  is_active: !s.is_active,
                                }),
                              s.is_active ? 'MCP 服务已停用' : 'MCP 服务已启用',
                            )
                          }
                        >
                          {s.is_active ? '停用' : '启用'}
                        </PermissionButton>

                        <PermissionButton
                          permission="admin"
                          type="button"
                          className="btn small danger"
                          onClick={() => setDeletingMcp(s)}
                          title="删除服务"
                        >
                          <Trash2 size={12} />
                        </PermissionButton>
                      </div>
                    </div>

                    {/* Cached Tools Accordion */}
                    {cachedToolsList.length > 0 && (
                      <div style={{ marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                        <button
                          type="button"
                          onClick={() => setExpandedMcpToolsId(isToolsExpanded ? null : s.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            color: '#2563eb',
                            fontWeight: 500,
                          }}
                        >
                          {isToolsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <span>已同步工具列表 ({cachedToolsList.length} 个)</span>
                        </button>

                        {isToolsExpanded && (
                          <div
                            style={{
                              marginTop: '8px',
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                              gap: '8px',
                            }}
                          >
                            {cachedToolsList.map((tool, idx) => (
                              <div
                                key={idx}
                                style={{
                                  padding: '8px 10px',
                                  borderRadius: '6px',
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                }}
                              >
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b', fontFamily: 'monospace' }}>
                                  {tool.name}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                  {tool.description || '无功能描述'}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <Pagination resource={servers} />
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: 长期记忆 (Long-Term Memory)                        */}
      {/* ========================================================= */}
      {activeTab === 'memory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Memory Toolbar & Filter */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '16px 20px',
              borderRadius: '10px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
            }}
          >
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                副驾驶长期知识与偏好记忆库
              </h2>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                沉淀企业品牌事实、业务服务偏好与策略经验，支持多轮对话动态提取与反思
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn small"
                onClick={() => setIsHookTestModalOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                title="模拟用户对话，测试自动反思与记忆切片提取"
              >
                <Sparkles size={13} color="#7c3aed" />
                <span>对话提取测试</span>
              </button>

              <PermissionButton
                permission="admin"
                type="button"
                className="btn small primary"
                onClick={() => {
                  setEditingMemory(null);
                  setIsMemoryModalOpen(true);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={13} />
                <span>录入新记忆</span>
              </PermissionButton>
            </div>
          </div>

          {/* Filtering Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {/* Type Filter Pills */}
              <button
                type="button"
                onClick={() => setMemoryTypeFilter('all')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: memoryTypeFilter === 'all' ? 600 : 400,
                  border: memoryTypeFilter === 'all' ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  background: memoryTypeFilter === 'all' ? '#eff6ff' : '#ffffff',
                  color: memoryTypeFilter === 'all' ? '#1d4ed8' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                全部类别 ({memoryList.length})
              </button>
              {Object.entries(MEMORY_TYPE_META).map(([typeKey, meta]) => {
                const count = memoryList.filter((m) => m.memory_type === typeKey).length;
                const isSelected = memoryTypeFilter === typeKey;
                return (
                  <button
                    key={typeKey}
                    type="button"
                    onClick={() => setMemoryTypeFilter(typeKey)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: isSelected ? 600 : 400,
                      border: isSelected ? `1px solid ${meta.color}` : '1px solid #e2e8f0',
                      background: isSelected ? meta.bg : '#ffffff',
                      color: isSelected ? meta.color : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    {meta.label} ({count})
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Status filter */}
              <select
                className="field"
                value={memoryStatusFilter}
                onChange={(e) => setMemoryStatusFilter(e.target.value as typeof memoryStatusFilter)}
                style={{ height: '34px', fontSize: '12px', padding: '0 8px' }}
              >
                <option value="all">所有状态</option>
                <option value="approved">仅已核准生效</option>
                <option value="pending">仅待审批</option>
              </select>

              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  color="#94a3b8"
                  style={{ position: 'absolute', left: '10px', top: '10px' }}
                />
                <input
                  type="text"
                  placeholder="搜索记忆标题或内容…"
                  value={memorySearch}
                  onChange={(e) => setMemorySearch(e.target.value)}
                  className="field"
                  style={{ paddingLeft: '30px', width: '180px', height: '34px' }}
                />
              </div>
            </div>
          </div>

          <ResourceState
            resource={memories}
            empty={!filteredMemories.length}
            emptyMessage={memorySearch || memoryTypeFilter !== 'all' ? '未找到符合条件的记忆条目' : '暂无长期记忆条目，可点击右上角录入'}
          />

          {/* Memory Cards Grid */}
          {filteredMemories.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: '14px',
              }}
            >
              {filteredMemories.map((m) => {
                const meta = MEMORY_TYPE_META[m.memory_type] || {
                  label: m.memory_type,
                  color: '#475569',
                  bg: '#f1f5f9',
                  border: '#cbd5e1',
                };
                const isPending = m.status === 'pending';

                return (
                  <div
                    key={m.id}
                    className="card"
                    style={{
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      borderRadius: '10px',
                      border: isPending ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
                      background: '#ffffff',
                      position: 'relative',
                    }}
                  >
                    <div>
                      {/* Card Header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '8px',
                          gap: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              color: meta.color,
                              background: meta.bg,
                              border: `1px solid ${meta.border}`,
                            }}
                          >
                            {meta.label}
                          </span>
                          <span className={`tag ${isPending ? 'amber' : 'green'}`}>
                            {isPending ? '待审批' : '已生效'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {m.is_pinned && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                fontSize: '10px',
                                background: '#fef3c7',
                                color: '#b45309',
                                padding: '2px 5px',
                                borderRadius: '4px',
                                fontWeight: 600,
                              }}
                            >
                              <Pin size={10} /> 置顶
                            </span>
                          )}
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {m.score_weight}x 权重
                          </span>
                        </div>
                      </div>

                      {/* Title & Body */}
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: '#0f172a',
                          marginBottom: '6px',
                        }}
                      >
                        {m.title}
                      </div>

                      <p
                        style={{
                          margin: 0,
                          fontSize: '12px',
                          color: '#475467',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          marginBottom: '10px',
                        }}
                      >
                        {m.content}
                      </p>

                      {/* Tags & Meta */}
                      {m.tags && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                          {m.tags.split(/[,，]/).map((tag, idx) => (
                            <span
                              key={idx}
                              style={{
                                fontSize: '10px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                color: '#64748b',
                              }}
                            >
                              #{tag.trim()}
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        来源: {m.extraction_source === 'agent_hook' ? '🤖 对话反思 Hook' : '手动录入'} · v{m.version || 1}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '6px',
                        marginTop: '12px',
                        borderTop: '1px solid #f1f5f9',
                        paddingTop: '10px',
                      }}
                    >
                      {isPending && (
                        <PermissionButton
                          permission="admin"
                          type="button"
                          className="btn small primary"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(
                              () => api.approveMemory(m.id),
                              '偏好记忆已审核通过并立即生效',
                            )
                          }
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Check size={12} />
                          <span>批准生效</span>
                        </PermissionButton>
                      )}

                      <PermissionButton
                        permission="admin"
                        type="button"
                        className="btn small"
                        onClick={() => {
                          setEditingMemory(m);
                          setIsMemoryModalOpen(true);
                        }}
                        title="编辑记忆"
                      >
                        <Edit3 size={12} />
                        <span>编辑</span>
                      </PermissionButton>

                      <PermissionButton
                        permission="admin"
                        type="button"
                        className="btn small danger"
                        onClick={() => setDeletingMemory(m)}
                        title="删除记忆"
                      >
                        <Trash2 size={12} />
                      </PermissionButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Pagination resource={memories} />
        </div>
      )}


      {/* ========================================================= */}
      {/* MODAL 2: Upload Skill ZIP                                 */}
      {/* ========================================================= */}
      {isUploadSkillModalOpen && (
        <SkillUploadModal
          isOpen={isUploadSkillModalOpen}
          file={skillZipFile}
          onFileChange={setSkillZipFile}
          onClose={() => setIsUploadSkillModalOpen(false)}
          onSubmit={async () => {
            if (!skillZipFile) return;
            const ok = await action.run(
              () => api.importCustomSkill(skillZipFile),
              '自定义技能包导入成功，待审核后启用',
            );
            if (ok) {
              setIsUploadSkillModalOpen(false);
              setSkillZipFile(null);
            }
          }}
          busy={action.busy}
        />
      )}

      {/* ========================================================= */}
      {/* MODAL 3: Create / Edit Custom Skill                       */}
      {/* ========================================================= */}
      {isSkillEditModalOpen && (
        <SkillEditModal
          isOpen={isSkillEditModalOpen}
          initialSkill={editingSkill}
          onClose={() => setIsSkillEditModalOpen(false)}
          onSubmit={async (data) => {
            let ok = false;
            if (editingSkill) {
              ok = await action.run(
                () => api.updateCustomSkill(editingSkill.id, data),
                '技能元数据与 SKILL.md 已成功更新',
              );
            } else {
              ok = await action.run(
                () => api.createCustomSkill(data as { skill_id: string; name: string; description?: string; content: string }),
                '新自定义技能已创建，请审核并启用',
              );
            }
            if (ok) setIsSkillEditModalOpen(false);
          }}
          busy={action.busy}
        />
      )}

      {/* ========================================================= */}
      {/* MODAL 4: Preview SKILL.md Drawer                         */}
      {/* ========================================================= */}
      {previewingSkill && (
        <div
          className="modal-backdrop open"
          role="dialog"
          aria-modal="true"
          style={{ zIndex: 100 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewingSkill(null);
          }}
        >
          <div
            style={{
              width: 'min(780px, 95vw)',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
                marginBottom: '16px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                    {previewingSkill.name}
                  </h3>
                  <span className={`tag ${previewingSkill.is_active ? 'green' : 'gray'}`}>
                    {previewingSkill.is_active ? '已启用' : '未启用'}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
                  ID: {previewingSkill.skill_id}
                </p>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setPreviewingSkill(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                功能描述
              </div>
              <div style={{ fontSize: '13px', color: '#1e293b', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px' }}>
                {previewingSkill.description || '无详细描述'}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                  SKILL.md 定义内容
                </span>
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => handleCopy(previewingSkill.content, 'preview-skill-md')}
                  style={{ fontSize: '11px' }}
                >
                  {copiedKey === 'preview-skill-md' ? <CheckCheck size={12} /> : <Copy size={12} />}
                  <span>{copiedKey === 'preview-skill-md' ? '已复制' : '复制代码'}</span>
                </button>
              </div>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '16px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                }}
              >
                <MarkdownView content={previewingSkill.content || '*无内容*'} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 5: Register / Edit MCP Server                       */}
      {/* ========================================================= */}
      {isMcpModalOpen && (
        <McpEditModal
          isOpen={isMcpModalOpen}
          initialMcp={editingMcp}
          onClose={() => setIsMcpModalOpen(false)}
          onSubmit={async (data, andTest) => {
            let ok = false;
            let targetId = editingMcp?.id;
            if (editingMcp) {
              ok = await action.run(
                () => api.updateMCPServer(editingMcp.id, data),
                'MCP 协议服务配置已更新',
              );
            } else {
              ok = await action.run(
                () => api.createMCPServer(data as { name: string; endpoint_url: string; transport_type?: string; auth_headers?: string; is_active?: boolean }),
                '新 MCP 协议服务已成功注册',
              );
            }
            if (ok) {
              setIsMcpModalOpen(false);
              if (andTest && targetId) {
                void action.run(async () => {
                  const ping = await api.pingMCPServer(targetId!);
                  if (ping.status !== 'online') throw new Error(ping.error || '握手失败');
                  onShowToast('握手测试成功', `就绪 ${ping.tools_count} 个可用工具`);
                }, '握手测试通过');
              }
            }
          }}
          busy={action.busy}
        />
      )}

      {/* ========================================================= */}
      {/* MODAL 6: Record / Edit Long-Term Memory                   */}
      {/* ========================================================= */}
      {isMemoryModalOpen && (
        <MemoryEditModal
          isOpen={isMemoryModalOpen}
          initialMemory={editingMemory}
          onClose={() => setIsMemoryModalOpen(false)}
          onSubmit={async (data) => {
            let ok = false;
            if (editingMemory) {
              ok = await action.run(
                () => api.updateMemoryEntry(editingMemory.id, data),
                '长期记忆条目已更新（需审核生效）',
              );
            } else {
              ok = await action.run(
                () => api.createMemoryEntry(data as { memory_type: string; title: string; content: string; tags?: string; is_pinned?: boolean; score_weight?: number }),
                '长期记忆已录入偏好知识库',
              );
            }
            if (ok) setIsMemoryModalOpen(false);
          }}
          busy={action.busy}
        />
      )}

      {/* ========================================================= */}
      {/* MODAL 7: Conversation Reflection Hook Test                */}
      {/* ========================================================= */}
      {isHookTestModalOpen && (
        <MemoryHookTestModal
          isOpen={isHookTestModalOpen}
          onClose={() => setIsHookTestModalOpen(false)}
          onShowToast={onShowToast}
        />
      )}

      {/* ========================================================= */}
      {/* CONFIRM DELETE DIALOGS                                    */}
      {/* ========================================================= */}
      {deletingSkill && (
        <ConfirmDialog
          title="删除自定义技能"
          message={`确定要删除技能「${deletingSkill.name}」(${deletingSkill.skill_id}) 吗？此操作不可逆。`}
          onClose={() => setDeletingSkill(null)}
          onConfirm={async () => {
            const ok = await action.run(
              () => api.deleteCustomSkill(deletingSkill.id),
              '自定义技能已成功删除',
            );
            if (ok) setDeletingSkill(null);
          }}
          busy={action.busy}
        />
      )}

      {deletingMcp && (
        <ConfirmDialog
          title="注销外部 MCP 服务"
          message={`确定要删除 MCP 服务「${deletingMcp.name}」吗？副驾驶将失去该服务暴露的工具能力。`}
          onClose={() => setDeletingMcp(null)}
          onConfirm={async () => {
            const ok = await action.run(
              () => api.deleteMCPServer(deletingMcp.id),
              'MCP 协议服务已成功注销',
            );
            if (ok) setDeletingMcp(null);
          }}
          busy={action.busy}
        />
      )}

      {deletingMemory && (
        <ConfirmDialog
          title="删除长期记忆"
          message={`确定要删除记忆「${deletingMemory.title}」吗？此操作将立即从知识库中移除。`}
          onClose={() => setDeletingMemory(null)}
          onConfirm={async () => {
            const ok = await action.run(
              () => api.deleteMemoryEntry(deletingMemory.id),
              '长期记忆条目已成功删除',
            );
            if (ok) setDeletingMemory(null);
          }}
          busy={action.busy}
        />
      )}
    </Page>
  );
}

// =========================================================================
// SUB-COMPONENT: Skill Upload Modal
// =========================================================================
function SkillUploadModal({
  isOpen,
  file,
  onFileChange,
  onClose,
  onSubmit,
  busy,
}: {
  isOpen: boolean;
  file: File | null;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  busy: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, isOpen, onClose, busy);

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      className="modal-backdrop open"
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 99 }}
    >
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit();
        }}
      >
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>导入 ZIP 技能包</h3>
          <button type="button" className="close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: '13px', color: '#475467', lineHeight: 1.5 }}>
            请上传符合规范的标准 Agent 技能压缩包（.zip 格式，小于 8MB）。
            <br />
            压缩包根目录或子目录下<b>必须包含合法的 SKILL.md 定义文件</b>。
          </div>

          <div
            style={{
              border: '2px dashed #cbd5e1',
              borderRadius: '10px',
              padding: '24px',
              textAlign: 'center',
              background: '#f8fafc',
              cursor: 'pointer',
            }}
            onClick={() => document.getElementById('skill-zip-file-input')?.click()}
          >
            <Upload size={28} color="#64748b" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
              {file ? file.name : '点击选择或拖拽 .zip 技能包文件'}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
              {file ? `${(file.size / 1024).toFixed(1)} KB` : '支持格式: *.zip'}
            </div>
            <input
              id="skill-zip-file-input"
              type="file"
              accept=".zip"
              style={{ display: 'none' }}
              onChange={(e) => onFileChange(e.target.files?.[0] || null)}
            />
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className="btn primary" disabled={busy || !file}>
            {busy ? '正在上传解析…' : '上传并导入'}
          </button>
        </div>
      </form>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: Skill Create/Edit Modal
// =========================================================================
function SkillEditModal({
  isOpen,
  initialSkill,
  onClose,
  onSubmit,
  busy,
}: {
  isOpen: boolean;
  initialSkill: CustomSkill | null;
  onClose: () => void;
  onSubmit: (data: { skill_id?: string; name: string; description: string; content: string }) => Promise<void>;
  busy: boolean;
}) {
  const isEditing = !!initialSkill;
  const [skillId, setSkillId] = useState(initialSkill?.skill_id || '');
  const [name, setName] = useState(initialSkill?.name || '');
  const [description, setDescription] = useState(initialSkill?.description || '');
  const [content, setContent] = useState(
    initialSkill?.content ||
      `---
name: ${name || '新技能'}
description: 描述该技能在何时触发与执行逻辑
---

# 指令说明
定义技能的执行步骤与边界：
1. 步骤一...
2. 步骤二...`,
  );

  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, isOpen, onClose, busy);

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      className="modal-backdrop open"
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 99 }}
    >
      <form
        className="modal"
        style={{ width: 'min(640px, 95vw)' }}
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({
            ...(!isEditing ? { skill_id: skillId } : {}),
            name,
            description,
            content,
          });
        }}
      >
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>{isEditing ? '编辑自定义技能' : '新建自定义技能'}</h3>
          <button type="button" className="close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {!isEditing && (
            <div className="form-group">
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                技能唯一标识 (Skill ID) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                className="field"
                required
                placeholder="例如：crm-lead-enrichment"
                pattern="[a-zA-Z0-9_-]+"
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
              />
            </div>
          )}

          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
              技能显示名称 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              className="field"
              required
              placeholder="例如：CRM 线索数据补全与打标"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>功能简述</label>
            <textarea
              className="field"
              style={{ minHeight: '50px', padding: '8px' }}
              placeholder="简要说明副驾驶何时调用该技能..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                SKILL.md 核心定义与提示词 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>支持 Markdown 语法</span>
            </div>
            <textarea
              className="field"
              required
              style={{
                minHeight: '160px',
                padding: '10px',
                fontFamily: 'monospace',
                fontSize: '12px',
                lineHeight: 1.5,
              }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? '正在保存…' : isEditing ? '保存修改' : '创建技能'}
          </button>
        </div>
      </form>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: MCP Server Create/Edit Modal
// =========================================================================
function McpEditModal({
  isOpen,
  initialMcp,
  onClose,
  onSubmit,
  busy,
}: {
  isOpen: boolean;
  initialMcp: MCPServer | null;
  onClose: () => void;
  onSubmit: (
    data: {
      name: string;
      transport_type: string;
      endpoint_url: string;
      auth_headers?: string;
      is_active: boolean;
    },
    andTest: boolean,
  ) => Promise<void>;
  busy: boolean;
}) {
  const isEditing = !!initialMcp;
  const [name, setName] = useState(initialMcp?.name || '');
  const [transportType, setTransportType] = useState(initialMcp?.transport_type || 'streamable_http');
  const [endpointUrl, setEndpointUrl] = useState(initialMcp?.endpoint_url || '');
  const [headers, setHeaders] = useState('');
  const [isActive, setIsActive] = useState(initialMcp?.is_active ?? true);
  const [jsonError, setJsonError] = useState('');

  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, isOpen, onClose, busy);

  const handleSubmit = (andTest: boolean) => {
    if (headers.trim()) {
      try {
        JSON.parse(headers);
        setJsonError('');
      } catch {
        setJsonError('请求头必须是合法的 JSON 格式，如 {"Authorization": "Bearer ..."}');
        return;
      }
    }
    void onSubmit(
      {
        name,
        transport_type: transportType,
        endpoint_url: endpointUrl,
        auth_headers: headers.trim() ? headers.trim() : undefined,
        is_active: isActive,
      },
      andTest,
    );
  };

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      className="modal-backdrop open"
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 99 }}
    >
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(false);
        }}
      >
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>{isEditing ? '编辑 MCP 服务' : '注册外部 MCP 服务'}</h3>
          <button type="button" className="close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
              服务显示名称 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              className="field"
              required
              placeholder="例如：CRM 数据洞察 MCP"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>传输协议类型</label>
            <select
              className="field"
              value={transportType}
              onChange={(e) => setTransportType(e.target.value)}
            >
              <option value="streamable_http">Streamable HTTP (推荐高性能流式)</option>
              <option value="http_sse">HTTP SSE (Server-Sent Events)</option>
              <option value="sse">SSE (原生长连接)</option>
            </select>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
              HTTPS 端点 URL <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              className="field"
              type="url"
              required
              placeholder="https://mcp.internal.example.com/v1/stream"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
              认证请求头 JSON (选填，自动加密保存)
            </label>
            <textarea
              className="field"
              style={{
                minHeight: '65px',
                padding: '8px',
                fontFamily: 'monospace',
                fontSize: '11px',
              }}
              placeholder='{"Authorization": "Bearer sec_..."}'
              value={headers}
              onChange={(e) => {
                setHeaders(e.target.value);
                setJsonError('');
              }}
            />
            {jsonError && <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '2px' }}>{jsonError}</div>}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>默认启用此服务</span>
          </label>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? '正在保存…' : isEditing ? '保存修改' : '注册服务'}
          </button>
        </div>
      </form>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: Memory Create/Edit Modal
// =========================================================================
function MemoryEditModal({
  isOpen,
  initialMemory,
  onClose,
  onSubmit,
  busy,
}: {
  isOpen: boolean;
  initialMemory: MemoryEntry | null;
  onClose: () => void;
  onSubmit: (data: {
    memory_type: string;
    title: string;
    content: string;
    tags?: string;
    is_pinned?: boolean;
    score_weight?: number;
  }) => Promise<void>;
  busy: boolean;
}) {
  const isEditing = !!initialMemory;
  const [memoryType, setMemoryType] = useState(initialMemory?.memory_type || 'user_pref');
  const [title, setTitle] = useState(initialMemory?.title || '');
  const [content, setContent] = useState(initialMemory?.content || '');
  const [tags, setTags] = useState(initialMemory?.tags || '');
  const [isPinned, setIsPinned] = useState(initialMemory?.is_pinned || false);
  const [scoreWeight, setScoreWeight] = useState(initialMemory?.score_weight ?? 1.0);

  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, isOpen, onClose, busy);

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      className="modal-backdrop open"
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 99 }}
    >
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({
            memory_type: memoryType,
            title,
            content,
            tags,
            is_pinned: isPinned,
            score_weight: scoreWeight,
          });
        }}
      >
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>{isEditing ? '编辑长期记忆条目' : '录入长期记忆'}</h3>
          <button type="button" className="close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
              记忆分类属性 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              className="field"
              value={memoryType}
              onChange={(e) => setMemoryType(e.target.value)}
            >
              <option value="user_pref">运营与用户偏好 (User Preferences) - 业务准则</option>
              <option value="brand_truth">品牌基准事实 (Brand Truth) - 核心事实基准</option>
              <option value="episodic_strategy">历史策略经验 (Episodic Strategy) - 反思沉淀</option>
            </select>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
              偏好要点标题 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              className="field"
              required
              placeholder="例如：回答中必须明确 24 小时售后质保政策"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
              偏好详细描述正文 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              className="field"
              required
              style={{ minHeight: '80px', padding: '8px' }}
              placeholder="只要涉及到开荒保洁，副驾驶必须强调全屋深度消杀作为标配服务..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>标签 (用逗号分隔)</label>
            <input
              className="field"
              placeholder="保洁, 售后, 政策规范"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
              />
              <span>📌 优先置顶此记忆</span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '12px', color: '#64748b' }}>召回权重：</label>
              <input
                type="number"
                step={0.1}
                min={0.1}
                max={5.0}
                className="field"
                style={{ width: '70px', textAlign: 'center' }}
                value={scoreWeight}
                onChange={(e) => setScoreWeight(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? '正在保存…' : isEditing ? '保存修改' : '录入长期记忆'}
          </button>
        </div>
      </form>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: Memory Hook Extraction Test Modal
// =========================================================================
function MemoryHookTestModal({
  isOpen,
  onClose,
  onShowToast,
}: {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (title: string, note?: string) => void;
}) {
  const [prompt, setPrompt] = useState('我们公司之后所有上门安装服务，必须穿戴鞋套并自备垃圾袋清理现场。');
  const [resp, setResp] = useState('好的，我已经记录下该项规范：在所有上门安装服务流程中，严格执行穿戴鞋套与自备垃圾袋清理现场的标配服务标准。');
  const [busy, setBusy] = useState(false);
  const [extracted, setExtracted] = useState<unknown[] | null>(null);

  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, isOpen, onClose, busy);

  const handleTest = async () => {
    setBusy(true);
    try {
      const res = await api.triggerMemoryHook({
        user_prompt: prompt,
        assistant_resp: resp,
      });
      setExtracted(res.extracted || []);
      onShowToast('Hook 提取执行成功', `识别出 ${res.count || 0} 条潜在偏好候选条目`);
      window.dispatchEvent(new Event('bgeo:updated'));
    } catch (e) {
      onShowToast('提取失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      className="modal-backdrop open"
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 99 }}
    >
      <div className="modal" style={{ width: 'min(640px, 95vw)' }}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>对话反思记忆提取测试 (Agent Hook Test)</h3>
          <button type="button" className="close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
            模拟副驾驶在对话闭环后，触发记忆提炼 Hook，从人机往返对话中提取出的事实偏好。
          </div>

          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
              模拟用户发言 (User Prompt)
            </label>
            <textarea
              className="field"
              style={{ minHeight: '60px', padding: '8px' }}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
              模拟助手回复 (Assistant Response)
            </label>
            <textarea
              className="field"
              style={{ minHeight: '60px', padding: '8px' }}
              value={resp}
              onChange={(e) => setResp(e.target.value)}
            />
          </div>

          {extracted && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>
                提取结果 ({extracted.length} 条候选条目已存入待审核库)：
              </div>
              <pre
                style={{
                  background: '#0f172a',
                  color: '#f8fafc',
                  padding: '10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  maxHeight: '160px',
                  overflowY: 'auto',
                }}
              >
                {JSON.stringify(extracted, null, 2)}
              </pre>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            关闭
          </button>
          <button type="button" className="btn primary" onClick={handleTest} disabled={busy}>
            {busy ? '正在分析提炼…' : '执行提取 Hook'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// SUB-COMPONENT: Generic Confirm Dialog
// =========================================================================
function ConfirmDialog({
  title,
  message,
  onClose,
  onConfirm,
  busy,
}: {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  busy: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, true, onClose, busy);

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      className="modal-backdrop open"
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 101 }}
    >
      <div className="modal" style={{ width: '420px' }}>
        <div className="modal-head">
          <h3 style={{ margin: 0, color: '#b91c1c' }}>{title}</h3>
          <button type="button" className="close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, fontSize: '13px', color: '#475467', lineHeight: 1.6 }}>
            {message}
          </p>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? '正在删除…' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default HarnessConfigView;
