import { useRef, useState } from 'react';
export function useAction(notify: (title: string, note?: string) => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const running = useRef(false);
  const run = async (action: () => Promise<unknown>, success: string) => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      notify(success);
      window.dispatchEvent(new Event('bgeo:updated'));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败';
      setError(message);
      notify('操作失败', message);
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run };
}
