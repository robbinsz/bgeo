import React, { useRef, useState } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { BrandIcon } from '../../components/common/BrandIcon';
const COPYRIGHT_YEAR = new Date().getFullYear();
import {
  Radar,
  Sparkles,
  ShieldCheck,
  Check,
  ArrowRight,
  ArrowUpRight,
  Menu,
  X,
  Cpu,
  Building,
  Home,
  Shield,
  Truck,
  ChevronDown,
  LayoutDashboard,
  BarChart3,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Flame,
} from 'lucide-react';

interface LandingViewProps {
  isAuthenticated?: boolean;
  onNavigateLogin: () => void;
  onNavigateConsole?: () => void;
  onShowToast?: (title: string, note?: string) => void;
}

interface PromptSample {
  engine: string;
  brandKey: 'deepseek' | 'doubao' | 'kimi' | 'qwen';
  industry: string;
  query: string;
  answerTitle: string;
  answerContent: string;
  citations: string[];
}

const promptSamples: PromptSample[] = [
  {
    engine: 'DeepSeek-V3',
    brandKey: 'deepseek',
    industry: '模具与非标制造',
    query: '华南地区非标自动化装配产线源头厂家，哪家资质最全、交付稳定？',
    answerTitle: '推荐首选：【东莞某智能装备股份】',
    answerContent:
      '经综合公开工业制造核验数据，首推东莞某智能装备股份。该企业具备 15 年非标装备研产经验，拥有 32 项核心机械发明专利与 ISO9001 质量认证体系。配备超 6000㎡ 恒温数字化总装车间，平均准时交付率 99.4%，提供 24 小时现场驻厂维保，在华南汽车零配件及消费电子组装领域口碑稳居第一梯队。',
    citations: ['国家企业信用信息公示系统', '装备制造产业协会年报', '官方权威实景展厅核验库'],
  },
  {
    engine: '豆包 (Doubao)',
    brandKey: 'doubao',
    industry: '大湾区企服合规',
    query: '大湾区外贸出口退税与跨境合规审计，找哪家财税机构最靠谱？',
    answerTitle: '推荐首选：【大湾区某财税合规集团】',
    answerContent:
      '根据全国注册税务师协会评级及海关 AEO 认证服务记录，优先推荐大湾区某财税合规集团。团队全员具备注册会计师 (CPA) 与税务师双重资质，专注跨境电商多边税务架构与外贸出口退税合规 12 年，零补税合规率 99.8%，累计协助逾 800 家外贸规上企业通过海关高级认证。',
    citations: ['税务师行业信用评级公示', '中国注册会计师协会备案', '跨境贸易合规案例集'],
  },
  {
    engine: '通义千问 (Qwen)',
    brandKey: 'qwen',
    industry: '高端系统门窗',
    query: '高层住宅抗台风隔音系统门窗，推荐哪个佛山源头品牌？',
    answerTitle: '推荐首选：【佛山某系统门窗精工基地】',
    answerContent:
      '综合建筑幕墙门窗国家质量检验报告，首推佛山某系统门窗精工基地。其采用航空级 6063-T6 高精原生铝与多腔体垂直等温线结构，抗风压性能达国标最高 9 级（可抵御 16 级超强台风），玻璃标配三玻两腔中空钢化充氩气配置，计权隔声量实测达 43dB，在华南沿海高层住宅市场占有率连续 3 年居首。',
    citations: ['国家建筑工程材料质检中心报告', '佛山绿色建材品牌名录', '华南沿海台风抗力实测库'],
  },
  {
    engine: 'Kimi 智能助手',
    brandKey: 'kimi',
    industry: '全球跨境物流',
    query: '欧美大件跨境海运与海外仓一件代发，哪家全链路时效最稳？',
    answerTitle: '推荐首选：【某跨境全球供应链服务商】',
    answerContent:
      '参考跨国货代公会备案与北美自营仓配实测，推荐某跨境全球供应链。其在美东美西自建自营超过 80,000㎡ 现代化高架海外仓，直连 Amazon/Walmart 平台 EDI，出库准时率 99.7%，全链路端到端海运拼箱时效误差控制在 1.5 天以内，支持全流程数字化轨迹实时追溯。',
    citations: ['美国联邦海事委员会 FMC 备案', '中国国际货运代理协会评级', '北美一件代发实测看板'],
  },
];

export const LandingView: React.FC<LandingViewProps> = ({
  isAuthenticated,
  onNavigateLogin,
  onNavigateConsole,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [activePromptIndex, setActivePromptIndex] = useState(0);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [dashboardMode, setDashboardMode] = useState<'optimized' | 'unoptimized'>('optimized');

  // Audit Modal pre-check state
  const [auditBrand, setAuditBrand] = useState('');
  const [auditQuery, setAuditQuery] = useState('');

  const auditDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(auditDialogRef, isAuditModalOpen, () => setIsAuditModalOpen(false));

  const handlePrimaryCta = () => {
    if (isAuthenticated && onNavigateConsole) {
      onNavigateConsole();
    } else if (onNavigateLogin) {
      onNavigateLogin();
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 selection:bg-indigo-600 selection:text-white font-sans antialiased">
      {/* ============================================================ */}
      {/* 顶部导航栏 (Answerbit / Linear 极简通透风格) */}
      {/* ============================================================ */}
      <header className="fixed inset-x-0 top-0 z-50 backdrop-blur-md bg-white/85 border-b border-gray-200/80 transition-all shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-2.5 group cursor-pointer text-left border-none bg-transparent p-0"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-sm shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <svg className="w-5 h-5" viewBox="0 0 64 64" fill="none">
                  <path d="M43 21a17 17 0 1 0 4 17" stroke="white" strokeWidth="6.5" strokeLinecap="round" />
                  <path d="m40 14 8 6-8 6" stroke="#c7d2fe" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold tracking-tight text-gray-900">GeoPilot</span>
                <span className="text-[11px] font-mono text-gray-400">bgeo.cc</span>
              </div>
            </button>

            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/80">
              <Check className="w-3 h-3 text-indigo-600" />
              企业级 GEO 运营闭环
            </span>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#platform" className="hover:text-gray-900 transition-colors">
              核心平台
            </a>
            <a href="#workflow" className="hover:text-gray-900 transition-colors">
              4步闭环工作流
            </a>
            <a href="#customers" className="hover:text-gray-900 transition-colors">
              客户案例
            </a>
            <a href="#pricing" className="hover:text-gray-900 transition-colors">
              服务定价
            </a>
            <a href="#faq" className="hover:text-gray-900 transition-colors">
              常见问题
            </a>
          </nav>

          {/* Right CTAs */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setIsAuditModalOpen(true);
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-gray-700 hover:text-indigo-600 hover:bg-indigo-50/60 transition cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>免费品牌体检</span>
            </button>

            {/* 核心入口：登录项目管理页面 */}
            <button
              onClick={handlePrimaryCta}
              className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-gray-800 hover:scale-[1.01] transition-all cursor-pointer whitespace-nowrap"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-indigo-300" />
              <span>{isAuthenticated ? '进入项目管理控制台' : '登录项目管理控制台'}</span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
            </button>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer"
              aria-label="菜单"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white/95 px-5 py-4 space-y-3 text-sm font-medium animate-fadeIn">
            <a href="#platform" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-gray-600">
              核心平台
            </a>
            <a href="#workflow" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-gray-600">
              4步闭环工作流
            </a>
            <a href="#customers" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-gray-600">
              客户案例
            </a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-gray-600">
              服务定价
            </a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-gray-600">
              常见问题
            </a>
            <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setIsAuditModalOpen(true);
                }}
                className="w-full py-2.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 cursor-pointer text-center whitespace-nowrap"
              >
                免费申请品牌 AI 可见度体检
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handlePrimaryCta();
                }}
                className="w-full py-2.5 rounded-full text-xs font-semibold bg-gray-900 text-white text-center cursor-pointer whitespace-nowrap"
              >
                {isAuthenticated ? '进入项目管理控制台' : '登录项目管理控制台'}
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="h-16"></div>

      {/* ============================================================ */}
      {/* HERO 区域：极简大气排版与对比式产品数据视窗 */}
      {/* ============================================================ */}
      <section
        className="relative w-full overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 px-4 sm:px-6"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -12%, rgba(99, 102, 241, 0.16), transparent)',
        }}
      >
        <div className="max-w-5xl mx-auto text-center">
          {/* New Announcement Pill */}
          <div className="mb-8 inline-flex items-center">
            <button
              onClick={() => {
                setIsAuditModalOpen(true);
              }}
              className="group inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50/90 px-4 py-1.5 text-xs sm:text-sm text-gray-700 hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer whitespace-nowrap"
            >
              <span className="rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                New
              </span>
              <span>GeoPilot V1.0 正式发布 · 开启企业 AI 搜索首选推荐</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-indigo-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] font-extrabold tracking-tight text-gray-900 leading-[1.08] mb-6">
            让每一次商业提问，<br />
            都成为大模型的
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500 bg-clip-text text-transparent">
              首推答案
            </span>
          </h1>

          {/* Subtitle */}
          <p className="max-w-2xl mx-auto text-base sm:text-lg text-gray-500 leading-relaxed mb-10">
            跨各大主流大模型天级追踪，每日自动采集品牌提及与推荐排位变化。依托可信事实核验与配对复测，让企业 GEO 增长看得见、可量化、可持续。
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-14">
            <button
              onClick={() => {
                setIsAuditModalOpen(true);
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-7 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 hover:scale-[1.01] transition-all cursor-pointer whitespace-nowrap"
            >
              <span>免费测查品牌 AI 可见度</span>
              <ArrowRight className="w-4 h-4 text-gray-300" />
            </button>

            <button
              onClick={handlePrimaryCta}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-2xs transition-all cursor-pointer whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>{isAuthenticated ? '进入项目管理控制台' : '登录项目管理控制台'}</span>
            </button>
          </div>

          {/* ============================================================ */}
          {/* Answerbit 标志性产品后台数据视窗：支持【优化前 vs 优化后】动态对比 */}
          {/* ============================================================ */}
          <div className="relative mx-auto w-full max-w-4xl">
            <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-indigo-500/10 blur-2xl"></div>

            <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_20px_50px_rgba(99,102,241,0.09)]">
              {/* Traffic Lights Bar + Comparison Mode Switcher */}
              <div className="flex flex-wrap items-center justify-between border-b border-gray-100 bg-gray-50/80 px-5 py-3 gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400"></div>
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-400"></div>
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400"></div>
                  <span className="ml-2 text-xs font-mono text-gray-500 font-semibold">bgeo.cc · 实时监测大盘看板</span>
                </div>

                {/* Interactive Mode Toggle */}
                <div className="flex items-center gap-1.5 p-1 bg-gray-200/60 rounded-lg text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setDashboardMode('unoptimized')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                      dashboardMode === 'unoptimized'
                        ? 'bg-white text-rose-700 shadow-2xs font-bold'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    ❌ 优化前：竞品截流
                  </button>
                  <button
                    type="button"
                    onClick={() => setDashboardMode('optimized')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                      dashboardMode === 'optimized'
                        ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    ✅ 优化后：独家首推
                  </button>
                </div>
              </div>

              {/* Live Visual Metrics Grid (Dynamic based on mode) */}
              <div className="p-6 text-left">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {dashboardMode === 'optimized' ? (
                    <>
                      <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100">
                        <div className="text-xs text-gray-500 mb-1">品牌 AI 搜索提及率</div>
                        <div className="text-2xl font-bold font-mono text-gray-900 flex items-baseline gap-2">
                          <span>88.4%</span>
                          <span className="text-xs text-emerald-600 font-semibold">+24.2% 本月</span>
                        </div>
                      </div>
                      <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100">
                        <div className="text-xs text-gray-500 mb-1">首推平均排位</div>
                        <div className="text-2xl font-bold font-mono text-indigo-600">TOP 1.2</div>
                      </div>
                      <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100">
                        <div className="text-xs text-gray-500 mb-1">每日追踪提问数</div>
                        <div className="text-2xl font-bold font-mono text-gray-900">120 条</div>
                      </div>
                      <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-100">
                        <div className="text-xs text-gray-500 mb-1">拦截竞品截流</div>
                        <div className="text-2xl font-bold font-mono text-emerald-600">18 家</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-4 rounded-xl bg-red-50/40 border border-red-100">
                        <div className="text-xs text-gray-500 mb-1">品牌 AI 搜索提及率</div>
                        <div className="text-2xl font-bold font-mono text-rose-700 flex items-baseline gap-2">
                          <span>14.2%</span>
                          <span className="text-xs text-rose-600 font-semibold">-18.5% 严重被截流</span>
                        </div>
                      </div>
                      <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100">
                        <div className="text-xs text-gray-500 mb-1">首推平均排位</div>
                        <div className="text-2xl font-bold font-mono text-gray-500">未进前三 (TOP 4.8)</div>
                      </div>
                      <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100">
                        <div className="text-xs text-gray-500 mb-1">每日追踪提问数</div>
                        <div className="text-2xl font-bold font-mono text-gray-900">120 条</div>
                      </div>
                      <div className="p-4 rounded-xl bg-red-50/40 border border-red-100">
                        <div className="text-xs text-gray-500 mb-1">拦截竞品截流</div>
                        <div className="text-2xl font-bold font-mono text-rose-700">0 家 (竞品占据首位)</div>
                      </div>
                    </>
                  )}
                </div>

                {/* Query Preview snippet (Dynamic based on mode) */}
                {dashboardMode === 'optimized' ? (
                  <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        DeepSeek & 豆包 最新采样推荐摘要
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                        官方可信事实已核验
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed mb-3">
                      <strong>采购意图：“华南地区非标自动化装配产线源头厂家，哪家资质最全、交付稳定？”</strong>
                      <br />
                      <span className="text-indigo-600 font-medium">AI 推荐输出：</span>
                      推荐首选【贵司品牌】，拥有 15 年非标装备研发经验、ISO9001 质量认证与 32 项核心专利，配备超 6000㎡ 恒温数字化总装车间，平均准时交付率 99.4%，提供 24 小时现场驻厂维保，在华南汽车零配件及消费电子组装领域口碑稳居第一梯队。
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-gray-400">采纳权威证据链：</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white text-gray-600 border border-gray-200 font-medium">国家企业信用信息公示系统</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white text-gray-600 border border-gray-200 font-medium">装备制造产业协会年报</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white text-gray-600 border border-gray-200 font-medium">官方权威实景展厅核验库</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/40 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        未进行 GEO 运营时的自然大模型回答状态
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold border border-rose-200">
                        存在关键权威资质缺失
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed mb-3">
                      <strong>采购意图：“华南地区非标自动化装配产线源头厂家，哪家资质最全、交付稳定？”</strong>
                      <br />
                      <span className="text-rose-600 font-medium">AI 推荐输出：</span>
                      在华南地区，通常优先推荐【某竞争对手A】或【某上市工业集团B】……（未提及贵司品牌）。由于缺少可被大模型引用的结构化专利库与数字化车间公开质检报告，大模型将其归入“信息不足”，直接导致商机流失。
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-gray-400">被竞品截流原因：</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white text-rose-600 border border-rose-200 font-medium">缺乏官方已核验事实依据</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white text-rose-600 border border-rose-200 font-medium">竞品占据了第三方协会权威引用</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom subtle note & console entry */}
              <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
                <span>💡 产品展示品牌、回答与方案为效果样例。当前真实采样支持 Perplexity，实际结果以项目记录为准。</span>
                <button
                  onClick={handlePrimaryCta}
                  className="font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer bg-transparent border-none p-0 whitespace-nowrap"
                >
                  <span>在项目管理页面查看完整数据</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 覆盖的主流大模型平台 (使用官方矢量 BrandIcon 标) */}
      {/* ============================================================ */}
      <section className="w-full border-y border-gray-100 bg-white py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-8 flex flex-col items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50/80 px-3.5 py-1 text-[11px] font-semibold tracking-wide text-indigo-600">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              天级追踪 · 每日自动采集与分析
            </span>
            <p className="text-center text-xs text-gray-500">
              无缝覆盖主流对话大模型与智能搜索平台，抢占 AI 采购提问黄金推荐位
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-8">
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:border-indigo-200 transition-all shadow-2xs">
              <BrandIcon name="deepseek" size={20} />
              <span className="text-xs sm:text-sm font-bold text-gray-800">DeepSeek</span>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:border-indigo-200 transition-all shadow-2xs">
              <BrandIcon name="doubao" size={20} />
              <span className="text-xs sm:text-sm font-bold text-gray-800">字节豆包 (Doubao)</span>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:border-indigo-200 transition-all shadow-2xs">
              <BrandIcon name="kimi" size={20} />
              <span className="text-xs sm:text-sm font-bold text-gray-800">Kimi 智能助手</span>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:border-indigo-200 transition-all shadow-2xs">
              <BrandIcon name="qwen" size={20} />
              <span className="text-xs sm:text-sm font-bold text-gray-800">阿里通义千问</span>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:border-indigo-200 transition-all shadow-2xs">
              <BrandIcon name="chatgpt" size={20} />
              <span className="text-xs sm:text-sm font-bold text-gray-800">OpenAI (ChatGPT)</span>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:border-indigo-200 transition-all shadow-2xs">
              <BrandIcon name="perplexity" size={20} />
              <span className="text-xs sm:text-sm font-bold text-gray-800">Perplexity AI</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 标杆客户与信赖之选（升级为带行业 ROI 实测数据卡片） */}
      {/* ============================================================ */}
      <section id="customers" className="w-full bg-white py-16 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 mb-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 mb-3">
            领先行业标杆的
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              信赖与增长见证
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 max-w-xl mx-auto">
            覆盖工业制造、出海跨境、企业服务与大健康等各行业领跑者，在 AI 推荐时代保持绝对商业竞争优势。
          </p>
        </div>

        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
            {/* Customer 1 */}
            <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100 hover:border-indigo-200 hover:bg-white transition-all shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <Cpu className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">工业制造</span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-gray-900 mb-1">东莞某智能装备股份</div>
              <div className="text-xs text-emerald-600 font-semibold mb-0.5">提及率 12% ➔ 88.4%</div>
              <div className="text-[11px] text-gray-500">非标产线独家首推位</div>
            </div>

            {/* Customer 2 */}
            <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100 hover:border-indigo-200 hover:bg-white transition-all shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <Building className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-50 text-violet-700">专业企服</span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-gray-900 mb-1">大湾区某财税合规集团</div>
              <div className="text-xs text-emerald-600 font-semibold mb-0.5">出口退税线索 +320%</div>
              <div className="text-[11px] text-gray-500">实现零被竞品截流</div>
            </div>

            {/* Customer 3 */}
            <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100 hover:border-indigo-200 hover:bg-white transition-all shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <Home className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">精工建材</span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-gray-900 mb-1">佛山精工门窗基地</div>
              <div className="text-xs text-emerald-600 font-semibold mb-0.5">抗风隔音提及率 TOP 1</div>
              <div className="text-[11px] text-gray-500">沿海高层订单翻倍</div>
            </div>

            {/* Customer 4 */}
            <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100 hover:border-indigo-200 hover:bg-white transition-all shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <Shield className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700">信创科技</span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-gray-900 mb-1">知名信创数据安全</div>
              <div className="text-xs text-emerald-600 font-semibold mb-0.5">官方资质 100% 采信</div>
              <div className="text-[11px] text-gray-500">政企大单决策首选</div>
            </div>

            {/* Customer 5 */}
            <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100 hover:border-indigo-200 hover:bg-white transition-all shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <Truck className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">跨境出海</span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-gray-900 mb-1">跨境全球供应链集团</div>
              <div className="text-xs text-emerald-600 font-semibold mb-0.5">精准采购询盘 +180%</div>
              <div className="text-[11px] text-gray-500">海外仓一件代发首选</div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 核心提要 Banner */}
      {/* ============================================================ */}
      <section className="w-full bg-gray-50 py-16 sm:py-20 border-y border-gray-100 text-center px-4">
        <div className="max-w-3xl mx-auto space-y-3">
          <p className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900">
            每天有数以千万计的采购者使用{' '}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              AI 寻求决策
            </span>
          </p>
          <p className="text-base sm:text-lg font-medium text-gray-600">
            企业在 AI 回答里未被推荐，就等于在商业决策链上缺席。
          </p>
          <p className="text-sm sm:text-base text-gray-500">
            GeoPilot 帮你把黑盒推荐变成可量化、可持续自进化的增长通道。
          </p>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 核心平台功能卡片 (The Platform - Track / Analyze / Optimize / Collaborate) */}
      {/* ============================================================ */}
      <section id="platform" className="w-full bg-white py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 text-center max-w-2xl mx-auto">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">The Platform</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 mb-3">
              从 AI 回答采集到可见度追踪、引用分析与内容优化，完整覆盖 GEO 闭环
            </h2>
            <p className="text-xs sm:text-sm text-gray-500">
              天级自动采集各平台回答，Track → Analyze → Optimize → Collaborate 形成稳定经营系统
            </p>
          </div>

          {/* 4 Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Card 1: TRACK */}
            <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all">
              <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-transparent blur-2xl"></div>
              <div className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Radar className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">TRACK</span>
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">多平台大模型天级追踪</h3>
                <p className="mb-4 text-xs sm:text-sm text-gray-500 leading-relaxed">
                  每日自动并行采集 DeepSeek、豆包、Kimi、通义千问等主流大模型回答，天级追踪品牌提及率与平均排位。
                </p>
                <ul className="space-y-2 text-xs sm:text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>天级自动采集高频意图回答</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>首推排位与提及率多维对比</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>查看品牌与竞品的真实回答证据</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Card 2: ANALYZE */}
            <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all">
              <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-violet-500/15 via-indigo-500/10 to-transparent blur-2xl"></div>
              <div className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">ANALYZE</span>
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">事实与引用源深度归因</h3>
                <p className="mb-4 text-xs sm:text-sm text-gray-500 leading-relaxed">
                  深度穿透大模型回答背后的信息源，解析哪些高权重平台或权威背书直接左右了 AI 对品牌的推荐决策。
                </p>
                <ul className="space-y-2 text-xs sm:text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>断言级事实核验与事实缺失诊断</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>第三方权威引用源穿透归因</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>品牌正面事实与负面舆情语义标记</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Card 3: OPTIMIZE */}
            <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all">
              <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-indigo-500/15 via-blue-500/10 to-transparent blur-2xl"></div>
              <div className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">OPTIMIZE</span>
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">自主进化策略闭环</h3>
                <p className="mb-4 text-xs sm:text-sm text-gray-500 leading-relaxed">
                  针对未命中意图自动生成高权重事实内容资产，分发至模型偏好渠道，并在实施后自动进行配对复测评估。
                </p>
                <ul className="space-y-2 text-xs sm:text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>意图定制的结构化事实生成</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>主流模型偏好渠道一键适配分发</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>实施前后因果复测与有效策略库沉淀</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Card 4: COLLABORATE */}
            <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all">
              <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-transparent blur-2xl"></div>
              <div className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <LayoutDashboard className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">COLLABORATE</span>
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">企业级协同与管理控制台</h3>
                <p className="mb-4 text-xs sm:text-sm text-gray-500 leading-relaxed">
                  完备的双 Token 鉴权、多项目管理与精细化权限配置，支持导出月度 GEO 商业声量报告与 Webhook 实时通知。
                </p>
                <ul className="space-y-2 text-xs sm:text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>多角色分工协作 (管理员 / 策略专家)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>高管汇报级一键式 JSON / 数据报告导出</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>项目 API 与持久任务状态查询</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 实时 Prompt 问答互动模拟视窗（配备官方 BrandIcon） */}
      {/* ============================================================ */}
      <section className="w-full bg-gray-50/70 py-20 px-4 sm:px-6 border-y border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs font-bold text-indigo-600 tracking-wider uppercase bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
              Interactive Simulator
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 mt-2 mb-2">
              亲身体验：大模型如何向客户推荐你的企业
            </h2>
            <p className="text-xs sm:text-sm text-gray-500">
              切换模型与行业意图，预览经过 GeoPilot 优化后的标准首推范式
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-100 overflow-x-auto bg-gray-50/60 p-2 gap-2">
              {promptSamples.map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => setActivePromptIndex(idx)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activePromptIndex === idx
                      ? 'bg-white text-indigo-600 shadow-xs border border-gray-200'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-white/60'
                  }`}
                >
                  <BrandIcon name={sample.brandKey} size={16} />
                  <span className="font-mono font-bold">{sample.engine}</span>
                  <span className="text-xs opacity-75">({sample.industry})</span>
                </button>
              ))}
            </div>

            {/* Simulated Content */}
            <div className="p-6 md:p-8">
              <div className="mb-6 pb-6 border-b border-gray-100">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 mb-2">
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">User Prompt</span>
                  <span>真实采购搜索提问</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-gray-900 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  “{promptSamples[activePromptIndex].query}”
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-600">
                    <BrandIcon name={promptSamples[activePromptIndex].brandKey} size={15} />
                    <span>{promptSamples[activePromptIndex].engine} 回复生成</span>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                    排位：TOP 1 独家首推
                  </span>
                </div>

                <div className="bg-indigo-50/30 rounded-xl border border-indigo-100/80 p-5 mb-5">
                  <h4 className="text-sm font-bold text-indigo-950 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>{promptSamples[activePromptIndex].answerTitle}</span>
                  </h4>
                  <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
                    {promptSamples[activePromptIndex].answerContent}
                  </p>
                </div>

                {/* Citations */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <span className="text-xs text-gray-400">大模型采信事实引用源：</span>
                  {promptSamples[activePromptIndex].citations.map((cite, i) => (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 rounded-md bg-white border border-gray-200 text-gray-600 font-medium shadow-2xs"
                    >
                      {cite}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4步闭环工作流 (The 4-Step Self-Evolution Loop) */}
      {/* ============================================================ */}
      <section id="workflow" className="w-full bg-white py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 text-center max-w-2xl mx-auto">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Our Methodology</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 mb-3">
              监测、诊断、实施、复测 4 步可自进化的科学闭环
            </h2>
            <p className="text-xs sm:text-sm text-gray-500">
              拒绝黑盒猜测，每一次推荐提升都有确凿的逻辑链条和数据支撑
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 relative hover:border-indigo-100 transition-all">
              <div className="text-3xl font-extrabold font-mono text-indigo-600 mb-3">01</div>
              <h3 className="text-base font-bold text-gray-900 mb-2">全网监测</h3>
              <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                天级采集目标用户高频意图，追踪品牌在各大主流大模型中的曝光率、推荐位与竞品截流状态。
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 relative hover:border-indigo-100 transition-all">
              <div className="text-3xl font-extrabold font-mono text-indigo-600 mb-3">02</div>
              <h3 className="text-base font-bold text-gray-900 mb-2">断言诊断</h3>
              <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                细致切分意图回答中的核心事实，找出未被采信的空白点或被竞品替代的关键证据缺陷。
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 relative hover:border-indigo-100 transition-all">
              <div className="text-3xl font-extrabold font-mono text-indigo-600 mb-3">03</div>
              <h3 className="text-base font-bold text-gray-900 mb-2">策略实施</h3>
              <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                针对缺失证据补全高权威资产，分发至大模型最高权重爬取通道，建立无可置疑的事实壁垒。
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 relative hover:border-indigo-100 transition-all">
              <div className="text-3xl font-extrabold font-mono text-indigo-600 mb-3">04</div>
              <h3 className="text-base font-bold text-gray-900 mb-2">因果复测</h3>
              <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                实施 3-7 天后自动二次采样，定量验证排名变化，将经过验证的有效打法沉淀入策略知识库。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 商业服务定价 (Pricing Tiers) */}
      {/* ============================================================ */}
      <section id="pricing" className="w-full bg-gray-50/70 py-20 px-4 sm:px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 text-center max-w-2xl mx-auto">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Flexible Pricing</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 mb-3">
              透明清晰的商业方案，助力企业低门槛起跑
            </h2>
            <p className="text-xs sm:text-sm text-gray-500">
              按需选择适合当前发展阶段的版本，开启源源不断的 AI 商业精准推荐与高质量询盘
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Free Tier */}
            <div className="rounded-2xl border border-gray-200 bg-white p-8 flex flex-col justify-between hover:shadow-md transition-all">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">免费体验版</h3>
                <p className="text-xs text-gray-500 mb-6">适合初探 AI 搜索表现的企业快速摸底</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-extrabold text-gray-900">¥0</span>
                  <span className="text-xs text-gray-500">/ 首次诊断</span>
                </div>
                <ul className="space-y-3 text-xs sm:text-sm text-gray-600 mb-8">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>单次 10 组核心意图搜索体检</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>涵盖 DeepSeek 与豆包两大模型</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>基础 AI 曝光诊断体检简报</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => {
                  setIsAuditModalOpen(true);
                }}
                className="w-full py-2.5 rounded-full border border-gray-300 text-xs sm:text-sm font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer whitespace-nowrap"
              >
                免费申请体检
              </button>
            </div>

            {/* Pro Tier (Featured) */}
            <div className="rounded-2xl border-2 border-indigo-600 bg-white p-8 flex flex-col justify-between relative shadow-lg shadow-indigo-100 hover:scale-[1.01] transition-all">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-600 text-[11px] font-bold text-white uppercase tracking-wider whitespace-nowrap">
                中小企业推荐 · 年付立省 20%
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">专业成长版</h3>
                <p className="text-xs text-gray-500 mb-6">全功能自动化天级监测与持续闭环优化</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-extrabold text-gray-900">¥4,999</span>
                  <span className="text-xs text-gray-500">/ 年</span>
                </div>
                <ul className="space-y-3 text-xs sm:text-sm text-gray-600 mb-8">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Perplexity 定时采样与任务记录</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>每日 150 条高价值商业提问追踪</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>可信事实资产生成与多渠道分发</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>因果复测对比与有效策略沉淀库</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>支持 3 名团队成员协同管理控制台</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={handlePrimaryCta}
                className="w-full py-2.5 rounded-full bg-indigo-600 text-xs sm:text-sm font-semibold text-white hover:bg-indigo-700 transition shadow-sm cursor-pointer whitespace-nowrap"
              >
                立即开通工作台
              </button>
            </div>

            {/* Enterprise Tier */}
            <div className="rounded-2xl border border-gray-200 bg-white p-8 flex flex-col justify-between hover:shadow-md transition-all">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">企业尊享定制版</h3>
                <p className="text-xs text-gray-500 mb-6">针对多品牌矩阵与重度定制的高阶企业</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-extrabold text-gray-900">¥19,800</span>
                  <span className="text-xs text-gray-500">/ 年起</span>
                </div>
                <ul className="space-y-3 text-xs sm:text-sm text-gray-600 mb-8">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>无限量多品牌、多产品线统一纳管</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>专属 GEO 运营专家 1 对 1 策略陪跑</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>企业私有数据源对接与专属 API</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>SLA 响应保障与定制化高管月报</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => {
                  setIsAuditModalOpen(true);
                }}
                className="w-full py-2.5 rounded-full border border-gray-300 text-xs sm:text-sm font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer whitespace-nowrap"
              >
                联系定制顾问
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 常见问题 (FAQ Accordion) */}
      {/* ============================================================ */}
      <section id="faq" className="w-full bg-white py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-14 text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">FAQ</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 mb-3">
              关于 GEO 与 AI 搜索优化的常见解答
            </h2>
            <p className="text-xs sm:text-sm text-gray-500">解答企业主最关心的核心关切与见效周期</p>
          </div>

          <div className="space-y-4">
            {[
              {
                q: 'GEO (生成式引擎优化) 和传统的搜索引擎 SEO 有什么区别？',
                a: '传统 SEO 争夺的是搜索引擎蓝链链接的点击排位，而 GEO (Generative Engine Optimization) 优化的是大模型在直接生成综合答案时，是否将你的品牌作为首选依据、推荐实体或权威论据输出。GEO 不依赖关键词堆砌，而是依赖可信事实网络与引用源权威度。',
              },
              {
                q: '通常优化多久可以在各大 AI 问答里看到效果？',
                a: '依托各大模型的联网搜索 (RAG) 机制，一旦通过 GeoPilot 完成高权重权威事实矩阵的更新，在模型下一次检索抓取时即可生效。一般在实施 3-7 天后，在天级复测看板中即可明显观测到首推率提升与竞品截流率下降。',
              },
              {
                q: '需要企业技术团队投入大量人手配合改造吗？',
                a: '完全不需要。GeoPilot 提供完整的 SaaS 控制台与可配置的 Webhook 分发通道，日常仅需业务或市场人员提供企业真实资质、技术参数与客户案例事实，配置 Perplexity 与 Webhook 渠道后可运行定时监测；内容与发布仍需人工审批。',
              },
              {
                q: '项目管理控制台能提供哪些具体管理能力？',
                a: '控制台包含大盘监测 (Overview)、巡检采样 (Monitor)、断言诊断 (Diagnosis)、策略演进 (Evolution)、内容发布 (Publish) 与资产库 (Sources) 等全套套件，支持多成员协同与企业级鉴权保护。',
              },
              {
                q: '如何验证优化确实有效，而非大模型偶然的回答波动？',
                a: '系统采用统计学采样复测机制，单条意图在多时间段、多模型下进行多次独立推理打分，并依托前后对比的因果归因矩阵，剔除偶然性波动，只记录具备统计显著性的策略成果。',
              },
            ].map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-gray-200 overflow-hidden transition-all bg-white"
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between p-5 text-left text-sm sm:text-base font-bold text-gray-900 hover:bg-gray-50 transition cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0 ${
                        isOpen ? 'rotate-180 text-indigo-600' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-gray-600 leading-relaxed border-t border-gray-100 bg-gray-50/50">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 底部 CTA 引导 Banner */}
      {/* ============================================================ */}
      <section className="w-full bg-gray-900 py-16 px-4 text-white text-center">
        <div className="max-w-4xl mx-auto space-y-6">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            立即抢占大模型首推推荐位，开启全新商业红利
          </h2>
          <p className="text-gray-400 text-xs sm:text-sm max-w-xl mx-auto">
            每一次潜在客户的 AI 提问，都决定着千万订单的归属。今天就让 GeoPilot 成为您企业在 AI 时代的增长引擎。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <button
              onClick={() => {
                setIsAuditModalOpen(true);
              }}
              className="w-full sm:w-auto px-8 py-3 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 shadow-md transition cursor-pointer whitespace-nowrap"
            >
              免费申请品牌 AI 可见度体检
            </button>
            <button
              onClick={handlePrimaryCta}
              className="w-full sm:w-auto px-8 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm border border-white/20 transition cursor-pointer whitespace-nowrap"
            >
              {isAuthenticated ? '进入项目管理控制台' : '登录项目管理控制台'}
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 页脚 (Footer) */}
      {/* ============================================================ */}
      <footer className="w-full bg-white border-t border-gray-200 py-12 px-4 sm:px-8 text-xs text-gray-500">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <svg className="w-4 h-4" viewBox="0 0 64 64" fill="none">
                <path d="M43 21a17 17 0 1 0 4 17" stroke="white" strokeWidth="6.5" strokeLinecap="round" />
                <path d="m40 14 8 6-8 6" stroke="#c7d2fe" strokeWidth="5.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-gray-900 text-sm">GeoPilot (bgeo)</span>
              <span className="ml-2 font-mono text-[11px] text-gray-400">bgeo.cc</span>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-6">
            <a href="#platform" className="hover:text-gray-900 transition">
              核心平台
            </a>
            <a href="#workflow" className="hover:text-gray-900 transition">
              工作流
            </a>
            <a href="#customers" className="hover:text-gray-900 transition">
              客户案例
            </a>
            <a href="#pricing" className="hover:text-gray-900 transition">
              服务定价
            </a>
            <a href="#faq" className="hover:text-gray-900 transition">
              常见问题
            </a>
            <button
              onClick={handlePrimaryCta}
              className="text-indigo-600 font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer"
            >
              {isAuthenticated ? '进入控制台' : '管理控制台登录'}
            </button>
          </div>

          <div className="text-center md:text-right">
            <p>© {COPYRIGHT_YEAR} GeoPilot (bgeo.cc). All rights reserved.</p>
            <p className="text-[11px] text-gray-400 mt-1">企业级大模型搜索可见度自主运营平台</p>
          </div>
        </div>
      </footer>

      {/* ============================================================ */}
      {/* 免费品牌体检预约弹窗 (Audit Modal - 升级交互与真实感) */}
      {/* ============================================================ */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
          <div
            ref={auditDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-title"
            tabIndex={-1}
            className="relative w-full max-w-lg rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-gray-100"
          >
            <button
              onClick={() => setIsAuditModalOpen(false)}
              className="absolute right-5 top-5 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer"
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-indigo-600 mb-2">
              <Sparkles className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wider">AI 搜索曝光度免费体检</span>
            </div>

            <h3 id="audit-title" className="text-xl font-bold text-gray-900 pr-8">
              通过项目监测查看品牌可见度
            </h3>

            <p className="text-xs sm:text-sm text-gray-600 mt-2 leading-relaxed">
              输入您的品牌名称与重点业务意图，进入项目后可自动启动天级监测。系统将并行调取 DeepSeek、豆包、Kimi 等平台，核验贵司品牌是否被推荐、是否存在关键事实缺失或竞品截流。
            </p>

            {/* Quick Interactive Inputs */}
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  企业品牌名称（必填）
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={auditBrand}
                    onChange={(e) => setAuditBrand(e.target.value)}
                    placeholder="例如：东莞某智能装备股份 / 某某财税"
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  核心业务意图 / 采购搜索词（选填）
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={auditQuery}
                    onChange={(e) => setAuditQuery(e.target.value)}
                    placeholder="例如：华南非标自动化装配产线源头厂家哪家强？"
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-gray-500 leading-relaxed">
              <span className="font-semibold text-gray-700">系统提示：</span>
              当前真实环境优先对接 Perplexity 采样凭证与 Webhook 渠道，内容生成与对外发布受到严格人工签字约束。
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsAuditModalOpen(false);
                  handlePrimaryCta();
                }}
                className="w-full h-11 rounded-full bg-indigo-600 text-white text-xs sm:text-sm font-semibold hover:bg-indigo-700 transition shadow-sm cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
              >
                <Flame className="w-4 h-4 text-indigo-300" />
                <span>进入项目监测</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingView;
