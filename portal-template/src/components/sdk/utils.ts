import type { ReactNode } from 'react';
import type { SdkAction, SdkCardProps, SdkInstall } from './types';

export function normalizeInstall(install: SdkCardProps['install']): SdkInstall | undefined {
  if (!install) return undefined;
  return typeof install === 'string' ? { command: install } : install;
}

export function isExternal(action: SdkAction): boolean {
  return action.external ?? /^[a-z][a-z0-9+.-]*:/i.test(action.href);
}

export function isPresent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== '';
}
