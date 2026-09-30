import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';

import type { ViewType, ToastItem, ModalConfig } from './types';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
const CopilotWorkbench = lazy(() => import('./features/copilot/CopilotWorkbench').then(module => ({default:module.CopilotWorkbench})));
const HarnessConfigView = lazy(() => import('./features/copilot/HarnessConfigView').then(module => ({default:module.HarnessConfigView})));
import { ToastContainer } from './components/ui/ToastContainer';
import { TaskModal } from './components/ui/TaskModal';
import { CopilotDrawer } from './components/copilot/CopilotDrawer';
import { SEO } from './components/common/SEO';

const OverviewView = lazy(() => import('./features/overview/OverviewView').then(module => ({default:module.OverviewView})));
const MonitorView = lazy(() => import('./features/monitor/MonitorView').then(module => ({default:module.MonitorView})));
const DiagnosisView = lazy(() => import('./features/diagnosis/DiagnosisView').then(module => ({default:module.DiagnosisView})));
const StrategyView = lazy(() => import('./features/strategy/StrategyView').then(module => ({default:module.StrategyView})));
const ContentView = lazy(() => import('./features/content/ContentView').then(module => ({default:module.ContentView})));
const PublishView = lazy(() => import('./features/publish/PublishView').then(module => ({default:module.PublishView})));
const ExperimentsView = lazy(() => import('./features/experiments/ExperimentsView').then(module => ({default:module.ExperimentsView})));
const EvolutionView = lazy(() => import('./features/evolution/EvolutionView').then(module => ({default:module.EvolutionView})));
const SourcesView = lazy(() => import('./features/sources/SourcesView').then(module => ({default:module.SourcesView})));
const SettingsView = lazy(() => import('./features/settings/SettingsView').then(module => ({default:module.SettingsView})));
import { LoginView } from './features/auth/LoginView';
import { LandingView } from './features/landing/LandingView';
import { UserProfileModal } from './features/auth/UserProfileModal';

import { api, getProjectID, setProjectID, type Project } from './services/api';
import { authService, type UserProfile } from './services/auth';
import { useWebSocket } from './hooks/useWebSocket';

const VALID_VIEWS = new Set<string>([
  'overview',
  'monitor',
  'diagnosis',
  'strategy',
  'content',
  'publish',
  'experiments',
  'evolution',
  'sources',
  'settings',
  'copilot',
  'harness',
]);

export function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(authService.getUser());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(authService.isAuthenticated());
  const [projects,setProjects]=useState<Project[]>([]);
  const [projectReady,setProjectReady]=useState(false);
  const [projectError,setProjectError]=useState('');
  const [mode,setMode]=useState('');
  const [projectVersion,setProjectVersion]=useState(0);
  const [modalKind,setModalKind]=useState<'monitor'|'strategy'|'content'>('monitor');
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Derive current view from current URL pathname
  const rawPath = location.pathname.replace(/^\//, '') || 'overview';
  const resolvedPath = rawPath === 'copilot/harness' ? 'harness' : rawPath;
  const currentView: ViewType = (VALID_VIEWS.has(resolvedPath) ? resolvedPath : 'overview') as ViewType;
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bgeo_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 860) {
      setMobileMenuOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => {
        const next = !prev;
        try {
          localStorage.setItem('bgeo_sidebar_collapsed', String(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
  };
  const [isCopilotDrawerOpen, setIsCopilotDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modal, setModal] = useState<ModalConfig>({ isOpen: false, title: '创建 GEO 任务' });

  // Global Cmd+K / Ctrl+K listener to toggle Copilot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCopilotDrawerOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Cycle execution state (7 steps)
  const [isCycleRunning, setIsCycleRunning] = useState(false);
  const [cycleStageIndex, setCycleStageIndex] = useState(0);

  // Evolution execution state (6 stages)
  const [isEvolutionRunning, setIsEvolutionRunning] = useState(false);
  const [evolutionStage, setEvolutionStage] = useState(0);

  const addToast = (title: string, note?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, note }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // WebSocket Live Updates
  useWebSocket((evt) => {
    if (evt.event === 'CYCLE_PROGRESS') {
      const payload = evt.payload;
      setIsCycleRunning(!payload.is_completed);
      setCycleStageIndex(payload.step_index || 0);
      if (payload.is_completed) {
        addToast(payload.status==='completed'?'监测已完成':'监测结束，请核对失败样本', payload.label);
      }
    } else if (evt.event === 'EVOLUTION_PROGRESS') {
      const payload = evt.payload;
      setIsEvolutionRunning(!payload.is_completed);
      setEvolutionStage(payload.stage_index || 0);
      if (payload.is_completed) {
        addToast('评估任务已结束', payload.label);
      }
    }
  });

  const handleNavigate = (view: ViewType) => {
    navigate(`/${view}`);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startCycle = async () => {
    if (isCycleRunning) {
      addToast('已有一轮任务正在运行', '请等待当前拨测完成');
      return;
    }
    setIsCycleRunning(true);
    setCycleStageIndex(0);
    handleNavigate('overview');

    try {
      await api.triggerMonitorRun();
      addToast('监测任务已受理', 'Worker 将执行采样，结果可在任务记录中查看');
    } catch (e) {
      setIsCycleRunning(false);addToast('监测受理失败',e instanceof Error?e.message:'连接失败');
    }
  };

  const startEvolution = async () => {
    if (isEvolutionRunning) {
      addToast('自进化周期正在运行中', '请稍候');
      return;
    }
    setIsEvolutionRunning(true);
    setEvolutionStage(0);

    try {
      await api.triggerEvolutionRun();
      addToast('已启动服务端策略自进化引擎', 'Worker 将评估配对样本，满足门槛时生成候选规则');
    } catch (e) {
      setIsEvolutionRunning(false);addToast('评估受理失败',e instanceof Error?e.message:'连接失败');
    }
  };

  const handleCreateTask = async (title: string,body: string) => {
    if(modalKind==='monitor')await api.createQuery(title,'商业决策','commercial');
    else if(modalKind==='strategy')await api.createStrategy(title);
    else await api.createContent(title,body);
    addToast('记录已保存');window.dispatchEvent(new Event('bgeo:updated'));
  };

  useEffect(() => {
    const unsubscribe = authService.subscribe((user) => {
      setCurrentUser(user);
      setIsAuthenticated(!!user);
    });

    if (authService.isAuthenticated()) {
      authService.fetchCurrentUser().catch(() => {});

    }

    return unsubscribe;
  }, [isAuthenticated]);

  useEffect(()=>{let active=true;setProjectReady(false);setProjectError('');if(isAuthenticated){Promise.all([api.getProjects(),api.getRuntime()]).then(([result,runtime])=>{if(!active)return;setProjects(result.items);setMode(runtime.mode);const chosen=result.items.find(p=>p.id===getProjectID())||result.items[0];if(chosen){setProjectID(chosen.id);setProjectReady(true)}else{setProjectError('当前账号没有可访问项目，请由管理员配置项目成员。')}}).catch(e=>{if(active)setProjectError(e.message)})}return()=>{active=false}},[isAuthenticated,projectVersion]);
  useEffect(()=>{if(!projectReady)return;let active=true;const refresh=()=>Promise.all([api.getMonitorRuns(),api.getEvolutionRuns()]).then(([monitor,evolution])=>{if(!active)return;setIsCycleRunning(monitor.items.some(r=>['queued','running'].includes(r.status)));setIsEvolutionRunning(evolution.items.some(r=>['queued','running'].includes(r.status)))}).catch(()=>{});void refresh();const timer=setInterval(refresh,3000);return()=>{active=false;clearInterval(timer)}},[projectReady,projectVersion]);

  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    await authService.logout();
    addToast('已安全退出登录', '双 Token 鉴权凭证已注销');
    navigate('/login');
  };

  const isLandingPath =
    location.pathname === '/' ||
    location.pathname === '/index.html' ||
    location.pathname === '/landing';

  if (isLandingPath) {
    return (
      <>
        <SEO title="GeoPilot · AI 搜索可见度与 GEO 运营闭环平台 (bgeo.cc)" />
        <LandingView
          isAuthenticated={isAuthenticated}
          onNavigateLogin={() => navigate('/login')}
          onNavigateConsole={() => navigate('/overview')}
          onShowToast={addToast}
        />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  if (!isAuthenticated) {
    if (location.pathname !== '/login') {
      return (
        <>
          <SEO title="账号登录 · Bgeo (bgeo.cc)" />
          <Navigate to="/login" replace state={{ from: location }} />
        </>
      );
    }
    return (
      <>
        <SEO title="账号登录 · Bgeo (bgeo.cc)" />
        <LoginView
          onNavigateHome={() => navigate('/')}
          onLoginSuccess={(user) => {
            handleLoginSuccess(user);
            const from = (location.state as any)?.from?.pathname || '/overview';
            navigate(from, { replace: true });
          }}
          onShowToast={addToast}
        />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  if (location.pathname === '/login') {
    return <Navigate to="/overview" replace />;
  }

  return (
    <div className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
        isOpen={mobileMenuOpen}
        isCollapsed={sidebarCollapsed}
        onClose={() => setMobileMenuOpen(false)}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenProfile={() => setIsProfileOpen(true)}
      />

      <div
        className={`mobile-mask ${mobileMenuOpen ? 'open' : ''}`}
        id="mobileMask"
        onClick={() => setMobileMenuOpen(false)}
      ></div>

      <main className={`main ${currentView === 'copilot' ? 'main-copilot' : ''}`}>
        <TopBar
          projectName={projects.find(project => project.id === getProjectID())?.name}
          projects={projects}
          currentProjectId={getProjectID()}
          onSelectProject={(id) => {
            setProjectID(id);
            setProjectVersion(v => v + 1);
          }}
          mode={mode}
          isSidebarCollapsed={sidebarCollapsed}
          onToggleMenu={handleToggleSidebar}
          onShowToast={addToast}
          currentUser={currentUser}
          onLogout={handleLogout}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenCopilot={() => setIsCopilotDrawerOpen((prev) => !prev)}
          onSearch={(query) => {
            if (query.trim()) {
              handleNavigate('monitor');
              addToast('已跳转至监测中心', `检索词：${query}`);
            }
          }}
        />

        <SEO />
        <div className={`content ${currentView === 'copilot' ? 'content-copilot' : ''}`}>
          {!projectReady?<div role="status">{projectError||'正在核验项目权限…'}{projectError&&<button className="btn" onClick={()=>setProjectVersion(v=>v+1)}>重试</button>}</div>:<Suspense fallback={<p role="status">正在加载页面…</p>}><Routes key={`${getProjectID()}:${projectVersion}`}>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route
              path="/overview"
              element={
                <OverviewView
                  onNavigate={handleNavigate}
                  onShowToast={addToast}
                  isCycleRunning={isCycleRunning}
                  onStartCycle={startCycle}
                  cycleStageIndex={cycleStageIndex}
                />
              }
            />
            <Route
              path="/monitor"
              element={
                <MonitorView
                  onShowToast={addToast}
                  onOpenModal={(title) => {setModalKind('monitor');setModal({ isOpen: true, title });}}
                />
              }
            />
            <Route
              path="/diagnosis"
              element={<DiagnosisView onShowToast={addToast} />}
            />
            <Route
              path="/strategy"
              element={
                <StrategyView
                  onShowToast={addToast}
                  onOpenModal={(title) => {setModalKind('strategy');setModal({ isOpen: true, title });}}
                />
              }
            />
            <Route
              path="/content"
              element={
                <ContentView
                  onShowToast={addToast}
                  onOpenModal={(title) => {setModalKind('content');setModal({ isOpen: true, title });}}
                />
              }
            />
            <Route
              path="/publish"
              element={<PublishView onShowToast={addToast} />}
            />
            <Route
              path="/experiments"
              element={
                <ExperimentsView
                  onShowToast={addToast}
                  onOpenModal={(title) => setModal({ isOpen: true, title })}
                />
              }
            />
            <Route
              path="/evolution"
              element={
                <EvolutionView
                  onShowToast={addToast}
                  isEvolutionRunning={isEvolutionRunning}
                  onStartEvolution={startEvolution}
                  evolutionStage={evolutionStage}
                />
              }
            />
            <Route
              path="/sources"
              element={<SourcesView onShowToast={addToast} />}
            />
            <Route
              path="/settings"
              element={<SettingsView onShowToast={addToast} />}
            />
            <Route path="/copilot" element={<CopilotWorkbench />} />
            <Route path="/copilot/harness" element={<HarnessConfigView onShowToast={addToast} />} />
            <Route path="/harness" element={<Navigate to="/copilot/harness" replace />} />
            <Route path="/login" element={<Navigate to="/overview" replace />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes></Suspense>}
        </div>
      </main>

      {modal.isOpen&&<TaskModal
        isOpen={modal.isOpen}
        title={modal.title}
        kind={modalKind}
        onClose={() => setModal({ isOpen: false, title: '' })}
        onSubmit={handleCreateTask}
      />}

      {currentUser && (
        <UserProfileModal
          user={currentUser}
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          onUpdated={(updated) => {
            setCurrentUser(updated);
            addToast('用户资料已更新', `当前品牌：${updated.name}（${updated.team || '增长团队'}）`);
          }}
        />
      )}

      {projectReady&&<CopilotDrawer key={getProjectID()}
        isOpen={isCopilotDrawerOpen}
        onClose={() => setIsCopilotDrawerOpen(false)}
        currentView={currentView}
      />}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default App;
