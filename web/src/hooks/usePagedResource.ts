import { useMemo, useState } from 'react';
import type { ItemPage, PageOptions } from '../services/api';
import { useResource } from './useResource';
export function usePagedResource<T>(
  loader: (page?: PageOptions) => Promise<ItemPage<T>>,
  pollMs = 0,
) {
  const [offset, setOffset] = useState(0);
  const read = useMemo(() => () => loader({ offset, limit: 100 }), [loader, offset]);
  return { ...useResource(read, pollMs), offset, setOffset };
}
