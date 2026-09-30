import {afterEach,it,expect,vi} from 'vitest';import {render,screen,cleanup,fireEvent,waitFor} from '@testing-library/react';import {TaskModal} from './TaskModal';import {CopilotActionCard} from '../copilot/CopilotActionCard';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('keeps failed saves open without announcing success',async()=>{const close=vi.fn();const save=vi.fn().mockRejectedValue(new Error('database offline'));render(<TaskModal isOpen title="创建内容" kind="content" onClose={close} onSubmit={save}/>);fireEvent.change(screen.getByLabelText('名称'),{target:{value:'Title'}});fireEvent.change(screen.getByLabelText('内容正文'),{target:{value:'Evidence'}});fireEvent.click(screen.getByText('保存'));await screen.findByRole('alert');expect(close).not.toHaveBeenCalled();expect(save).toHaveBeenCalledWith('Title','Evidence')});
it('shows queued approval until an actual completion is supplied',async()=>{const preview={interrupt_id:'id',card_type:'preview_schedule',title:'Schedule',description:'Review',tool_name:'update_schedule_config',tool_args:'{}',details:{frequency:'daily',time_slot:'09:00'}};const {rerender}=render(<CopilotActionCard preview={preview} status="pending" onConfirm={async()=>{}} onCancel={async()=>{}}/>);fireEvent.click(screen.getByText('确认并投递任务'));await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('等待任务执行'));expect(screen.queryByText('执行已完成，请核对实际结果')).toBeNull();rerender(<CopilotActionCard preview={preview} status="completed" onConfirm={async()=>{}} onCancel={async()=>{}}/>);await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('执行已完成'))});

import { LoginView } from '../../features/auth/LoginView';
import { api } from '../../services/api';
it.each(['live', 'demo'])('shows demo credentials only for explicit %s runtime', async mode => {
  vi.spyOn(api, 'getRuntime').mockResolvedValue({mode, environment:'development'});
  render(<LoginView onLoginSuccess={vi.fn()} onShowToast={vi.fn()}/>);
  expect((screen.getByLabelText('企业邮箱 / 账号') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('访问密码') as HTMLInputElement).value).toBe('');
  if(mode === 'demo') {
    const button = await screen.findByText('填入演示账号');
    fireEvent.click(button);
    expect((screen.getByLabelText('企业邮箱 / 账号') as HTMLInputElement).value).toBe('admin@bgeo.cc');
  } else {
    await waitFor(() => expect(api.getRuntime).toHaveBeenCalledOnce());
    expect(screen.queryByText('填入演示账号')).toBeNull();
    expect(screen.queryByText('演示环境预设凭据')).toBeNull();
  }
});
