import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services/api';
import { useCopilotSession } from './useCopilotSession';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('Copilot session isolation', () => {
  it('ignores a delayed response after another session has been selected', async () => {
    vi.spyOn(api, 'getCopilotSessions').mockResolvedValue({ items: [] });
    const old = deferred<Awaited<ReturnType<typeof api.getCopilotSession>>>();
    vi.spyOn(api, 'getCopilotSession').mockImplementation((id) =>
      id === 'old'
        ? old.promise
        : Promise.resolve({
            session: { id } as never,
            messages: [
              {
                id: 'new-message',
                session_id: id,
                role: 'assistant',
                content: 'new session',
                created_at: '',
              },
            ],
            checkpoint: null,
          }),
    );
    const { result } = renderHook(() => useCopilotSession(true, {}));
    await waitFor(() => expect(result.current.messages[0]?.id).toBe('welcome'));
    act(() => {
      void result.current.loadSessionDetails('old');
    });
    await act(() => result.current.loadSessionDetails('new'));
    await act(async () => {
      old.resolve({
        session: { id: 'old' } as never,
        messages: [
          {
            id: 'old-message',
            session_id: 'old',
            role: 'assistant',
            content: 'stale response',
            created_at: '',
          },
        ],
        checkpoint: null,
      });
      await old.promise;
    });
    expect(result.current.currentSessionId).toBe('new');
    expect(result.current.messages.map((m) => m.content)).toEqual(['new session']);
  });
});
