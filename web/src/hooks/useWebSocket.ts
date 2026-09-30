import {useEffect, useRef} from 'react';
import {authService} from '../services/auth';
import {getProjectID} from '../services/api';
export interface WebSocketEvent {event: string;topic: string;timestamp: number;payload: any;}
export function useWebSocket(onEvent:(event:WebSocketEvent)=>void){
 const callback=useRef(onEvent);useEffect(()=>{callback.current=onEvent},[onEvent]);const wsRef=useRef<WebSocket|null>(null);
 useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>|undefined;let attempts=0;
 const connect=()=>{if(stopped||!authService.getAccessToken()||!getProjectID())return;const protocol=location.protocol==='https:'?'wss:':'ws:';const params=new URLSearchParams({token:authService.getAccessToken()!,project_id:getProjectID()});const socket=new WebSocket(`${protocol}//${location.host}/ws/live?${params}`);wsRef.current=socket;socket.onopen=()=>{attempts=0};socket.onmessage=event=>{try{callback.current(JSON.parse(event.data))}catch{}};socket.onclose=()=>{if(!stopped&&attempts<8){timer=setTimeout(connect,Math.min(30000,1000*2**attempts++))}};};
 const restart=()=>{clearTimeout(timer);if(wsRef.current){wsRef.current.onclose=null;wsRef.current.close()}connect()};connect();window.addEventListener('bgeo:project',restart);const unsubscribe=authService.subscribe(restart);
 return()=>{stopped=true;clearTimeout(timer);unsubscribe();window.removeEventListener('bgeo:project',restart);wsRef.current?.close()};},[]);return wsRef;
}
