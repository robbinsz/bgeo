import React, { useState } from 'react';
import { ShieldCheck, XCircle, ArrowRight, ShieldAlert } from 'lucide-react';
import type { CopilotActionPreview } from '../../types';
import { PermissionButton } from '../ui/Permissions';

interface CopilotActionCardProps {
  preview: CopilotActionPreview;
  status: string; // 'pending' | 'executed' | 'rejected'
  onConfirm: (interruptId: string) => Promise<void>;
  onCancel: (interruptId: string) => Promise<void>;
}

export const CopilotActionCard: React.FC<CopilotActionCardProps> = ({
  preview,
  status: initialStatus,
  onConfirm,
  onCancel,
}) => {
  const [optimisticStatus, setCurrentStatus] = useState('pending');
  const currentStatus =
    initialStatus && initialStatus !== 'pending' ? initialStatus : optimisticStatus;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setIsLoading(true);
    setError('');
    try {
      await onConfirm(preview.interrupt_id);
      setCurrentStatus('queued');
    } catch (e) {
      setError(e instanceof Error ? e.message : '审批受理失败');
    } finally {
      setIsLoading(false);
    }
  };
  const handleCancel = async () => {
    setIsLoading(true);
    setError('');
    try {
      await onCancel(preview.interrupt_id);
      setCurrentStatus('cancelled');
    } catch (e) {
      setError(e instanceof Error ? e.message : '取消失败');
    } finally {
      setIsLoading(false);
    }
  };
  const isSchedule = preview.card_type === 'preview_schedule';

  return (
    <div className="mt-3.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/90 px-3.5 py-2.5">
        <div className="flex items-center space-x-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-900 text-white">
            <ShieldAlert className="h-3 w-3" />
          </span>
          <span className="text-xs font-semibold text-slate-800">{preview.title}</span>
        </div>
        <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-mono font-medium text-slate-600">
          安全确认闸门 · 需要审批
        </span>
      </div>

      {/* Body Details */}
      <div className="p-3.5 text-xs text-slate-700">
        <p className="mb-2.5 text-slate-500">{preview.description}</p>

        <div className="space-y-2 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3">
          {isSchedule ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">调度频次</span>
                <span className="font-semibold text-slate-900 font-mono">
                  {preview.details.frequency === 'hourly'
                    ? '每小时一次 (Hourly)'
                    : preview.details.frequency === 'weekly'
                      ? '每周一次 (Weekly)'
                      : '每日一次 (Daily)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">每日触发时点</span>
                <span className="font-mono font-medium text-slate-900">
                  {preview.details.time_slot || '09:00'}
                </span>
              </div>
              {preview.details.reason && (
                <div className="flex items-start justify-between gap-3 pt-1.5 border-t border-slate-200/60">
                  <span className="text-slate-400 shrink-0">变更事由</span>
                  <span className="text-right text-slate-600">{preview.details.reason}</span>
                </div>
              )}
            </>
          ) : preview.card_type === 'preview_tool' ? (
            <pre className="whitespace-pre-wrap">{JSON.stringify(preview.details, null, 2)}</pre>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">目标渠道</span>
                <span className="font-semibold text-slate-900">{preview.details.channel}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-400 shrink-0">发布标题</span>
                <span className="font-medium text-right text-slate-800">
                  {preview.details.title}
                </span>
              </div>
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {/* Footer Actions or Result Badge */}
        <div className="mt-3.5 flex items-center justify-end">
          {currentStatus === 'pending' ? (
            <div className="flex items-center space-x-2">
              <PermissionButton
                permission="review"
                type="button"
                disabled={isLoading}
                onClick={handleCancel}
                className="flex items-center space-x-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition"
              >
                <XCircle className="h-3.5 w-3.5 text-slate-400" />
                <span>取消</span>
              </PermissionButton>
              <PermissionButton
                permission="review"
                type="button"
                disabled={isLoading}
                onClick={handleConfirm}
                className="flex items-center space-x-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>{isLoading ? '正在记录审批…' : '确认并投递任务'}</span>
                <ArrowRight className="h-3 w-3 opacity-60" />
              </PermissionButton>
            </div>
          ) : (
            <div
              role="status"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
            >
              {{
                queued: '审批已记录，等待任务执行',
                completed: '执行已完成，请核对实际结果',
                failed: '执行失败，请查看任务与回执',
                cancelled: '审批已取消',
                expired: '审批已过期',
                outcome_unknown: '执行结果不确定，需核对回执',
              }[currentStatus] || currentStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
