import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { api } from '../../services/api';
import { useResource } from '../../hooks/useResource';
import { PermissionContext, usePermissions } from '../../hooks/permissions';
export function PermissionProvider({ children }: { children: ReactNode }) {
  const access = useResource(api.getAccess);
  return (
    <PermissionContext
      value={
        !access.error && access.data ? access.data : { write: false, review: false, admin: false }
      }
    >
      {access.error && <p role="alert">无法读取项目权限：{access.error}</p>}
      {children}
    </PermissionContext>
  );
}
export function PermissionButton({
  permission = 'write',
  disabled,
  title,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  permission?: 'write' | 'review' | 'admin';
}) {
  const permissions = usePermissions();
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      disabled={disabled || !permissions[permission]}
      title={!permissions[permission] ? '当前项目角色没有此操作权限' : title}
    />
  );
}
