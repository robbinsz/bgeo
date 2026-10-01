import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { authService } from '../services/auth';
import { getProjectID } from '../services/api';

type Snapshot<T> = { data: T | null; error: string; loading: boolean };
class Resource<T> {
  snapshot: Snapshot<T> = { data: null, error: '', loading: true };
  listeners = new Set<() => void>();
  inFlight: Promise<void> | null = null;
  readonly loader: () => Promise<T>;
  constructor(loader: () => Promise<T>) {
    this.loader = loader;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  reload = () => {
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      try {
        this.snapshot = {
          data: await this.loader(),
          error: '',
          loading: false,
        };
      } catch (error) {
        this.snapshot = {
          ...this.snapshot,
          error: error instanceof Error ? error.message : '读取失败',
          loading: false,
        };
      } finally {
        this.inFlight = null;
        this.listeners.forEach((listener) => listener());
      }
    })();
    return this.inFlight;
  };
}
const scopes = new Map<string, WeakMap<() => Promise<unknown>, Resource<unknown>>>();
const scope = () =>
  `${authService.getGeneration()}:${authService.getUser()?.id ?? ''}:${getProjectID()}`;
const subscribeScope = (listener: () => void) => {
  const unsubscribe = authService.subscribe(listener);
  window.addEventListener('bgeo:project', listener);
  return () => {
    unsubscribe();
    window.removeEventListener('bgeo:project', listener);
  };
};
export function useResource<T>(loader: () => Promise<T>, pollMs = 0, enabled = true) {
  const currentScope = useSyncExternalStore(subscribeScope, scope);
  const resource = useMemo(() => {
    let cache = scopes.get(currentScope);
    if (!cache) {
      cache = new WeakMap();
      scopes.set(currentScope, cache);
    }
    let resource = cache.get(loader) as Resource<T> | undefined;
    if (!resource) {
      resource = new Resource(loader);
      cache.set(loader, resource as Resource<unknown>);
    }
    return resource;
  }, [currentScope, loader]);
  const snapshot = useSyncExternalStore(resource.subscribe, resource.getSnapshot);
  useEffect(() => {
    if (!enabled) return;
    void resource.reload();
    const reload = () => {
      if (document.visibilityState !== 'hidden') void resource.reload();
    };
    const refresh = () => {
      void resource.reload();
    };
    window.addEventListener('bgeo:updated', refresh);
    window.addEventListener('focus', reload);
    const timer = pollMs ? setInterval(reload, pollMs) : undefined;
    return () => {
      clearInterval(timer);
      window.removeEventListener('bgeo:updated', refresh);
      window.removeEventListener('focus', reload);
    };
  }, [resource, pollMs, enabled]);
  // Keep only the active session's cache; old in-flight results cannot enter its stores.
  useEffect(() => {
    for (const key of scopes.keys()) if (key !== currentScope) scopes.delete(key);
  }, [currentScope]);
  return { ...snapshot, reload: resource.reload };
}
