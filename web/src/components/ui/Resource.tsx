import {useState,useEffect,useCallback,useRef,type ReactNode} from 'react';
export function useResource<T>(loader:()=>Promise<T>,pollMs=0){
 const [data,setData]=useState<T|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);const active=useRef(true);const sequence=useRef(0);
 const reload=useCallback(async()=>{const seq=++sequence.current;try{const result=await loader();if(active.current&&seq===sequence.current){setData(result);setError('')}}catch(e){if(active.current&&seq===sequence.current)setError(e instanceof Error?e.message:'读取失败')}finally{if(active.current&&seq===sequence.current)setLoading(false)}},[loader]);
 useEffect(()=>{active.current=true;void reload();const refresh=()=>void reload();window.addEventListener('bgeo:updated',refresh);const timer=pollMs?setInterval(refresh,pollMs):undefined;return()=>{active.current=false;sequence.current++;clearInterval(timer);window.removeEventListener('bgeo:updated',refresh)}},[reload,pollMs]);return {data,error,loading,reload};
}
export function ResourceState({resource,empty=false,emptyMessage="暂无数据"}:{resource:{loading:boolean;error:string;reload:()=>Promise<void>};empty?:boolean;emptyMessage?:string}){
  if (resource.loading) {
    return (
      <div className="resource-loading" role="status">
        <span className="loading-spinner" aria-hidden="true"></span>
        <span>正在读取最新数据…</span>
      </div>
    );
  }
  if (resource.error) {
    return (
      <div className="resource-error" role="alert">
        <div className="error-copy">
          <strong>数据读取失败</strong>
          <p>{resource.error}</p>
        </div>
        <button className="btn small" onClick={()=>void resource.reload()}>重试</button>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="resource-empty" role="status">
        <div className="empty-icon">📭</div>
        <div className="empty-text">{emptyMessage}</div>
      </div>
    );
  }
  return null;
}
export function Page({id,className,title,description,actions,children}:{id?:string;className?:string;title:string;description:string;actions?:ReactNode;children:ReactNode}){
  return (
    <section id={id} className={`view active ${className||''}`}>
      <div className="page-head">
        <div className="page-title">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions && <div className="head-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
export function useAction(notify:(title:string,note?:string)=>void){const [busy,setBusy]=useState(false);const [error,setError]=useState('');const run=async(action:()=>Promise<unknown>,success:string)=>{if(busy)return false;setBusy(true);setError('');try{await action();notify(success);window.dispatchEvent(new Event('bgeo:updated'));return true}catch(e){const message=e instanceof Error?e.message:'操作失败';setError(message);notify('操作失败',message);return false}finally{setBusy(false)}};return{busy,error,run}}
