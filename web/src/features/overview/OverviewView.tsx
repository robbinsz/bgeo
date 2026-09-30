import type {ViewType} from '../../types';
import {api} from '../../services/api';
import {Page,ResourceState,useResource} from '../../components/ui/Resource';
interface Props {onNavigate:(view:ViewType)=>void;onShowToast:(title:string,note?:string)=>void;isCycleRunning:boolean;onStartCycle:()=>void;cycleStageIndex:number;}
export function OverviewView({onStartCycle,isCycleRunning,onNavigate}:Props){const metrics=useResource(api.getMetrics,5000);const jobs=useResource(api.getJobs,5000);const m=metrics.data;
 const value=(v:unknown,suffix='')=>typeof v==='number'?`${v.toFixed(1)}${suffix}`:'—';
 return <Page title="GEO 运行总览" description="指标来自最近一个已结束监测批次的真实有效回答；演示、历史未标记、失败与拒答样本不计入。" actions={<button className="btn primary" disabled={isCycleRunning} onClick={onStartCycle}>{isCycleRunning?'监测已受理':'启动监测'}</button>}>
 <ResourceState resource={metrics}/>{m&&<div className="stats">{[['品牌提及率',value(m.voice_share,'%')],['采样覆盖率',value(m.query_coverage,'%')],['平均列表位次',value(m.avg_rank)],['有效样本',m.valid_samples],['失败样本',m.failed_samples],['生效规则',m.active_rules_count]].map(([label,v])=><article className="card stat" key={label}><div className="stat-top">{label}</div><div className="stat-value">{v}</div></article>)}</div>}
 <article className="card panel"><h2>后台任务</h2><p>任务进度从数据库恢复，页面刷新和连接中断不会把任务标记为成功。</p><ResourceState resource={jobs} empty={!jobs.data?.items.length}/><div className="overflow-x-auto"><table><thead><tr><th>任务</th><th>状态</th><th>尝试</th><th>错误</th></tr></thead><tbody>{jobs.data?.items.map(j=><tr key={j.id}><td>{j.kind}<small>{j.id}</small></td><td>{j.status}</td><td>{j.attempts}/{j.max_attempts}</td><td>{j.error_message||'—'}</td></tr>)}</tbody></table></div><button className="btn" onClick={()=>onNavigate('monitor')}>查看采样证据</button></article>
 </Page>}
