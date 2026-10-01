import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, setProjectID } from '../services/api';
import { PermissionButton, PermissionProvider } from '../components/ui/Permissions';
import { useResource } from './useResource';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('project resources and permissions', () => {
  it('coalesces concurrent reads and isolates an old project response', async () => {
    setProjectID('old-project');
    let resolveOld!: (value: string) => void;
    const old = new Promise<string>((resolve) => {
      resolveOld = resolve;
    });
    const loader = vi
      .fn()
      .mockImplementationOnce(() => old)
      .mockResolvedValue('new-project-data');
    const { result } = renderHook(() => ({
      first: useResource(loader),
      second: useResource(loader),
    }));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    act(() => setProjectID('new-project'));
    await waitFor(() => expect(result.current.first.data).toBe('new-project-data'));
    await act(async () => {
      resolveOld('old-project-data');
      await old;
    });
    expect(result.current.second.data).toBe('new-project-data');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('denies mutations when a previously successful permission read fails', async () => {
    setProjectID('permission-test');
    vi.spyOn(api, 'getAccess')
      .mockResolvedValueOnce({
        role: 'owner',
        write: true,
        review: true,
        admin: true,
      })
      .mockRejectedValue(new Error('权限服务不可用'));
    render(
      <PermissionProvider>
        <PermissionButton>保存配置</PermissionButton>
      </PermissionProvider>,
    );
    await waitFor(() =>
      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false),
    );
    act(() => window.dispatchEvent(new Event('bgeo:updated')));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('权限服务不可用'));
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
