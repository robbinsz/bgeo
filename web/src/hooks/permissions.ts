import { createContext, useContext } from 'react';
import type { Capabilities } from '../services/api';
export const PermissionContext = createContext<Capabilities>({
  write: false,
  review: false,
  admin: false,
});
export const usePermissions = () => useContext(PermissionContext);
