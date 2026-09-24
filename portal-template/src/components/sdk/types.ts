import type { ReactNode } from 'react';

export type SdkIconName =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'java'
  | 'dotnet'
  | 'csharp'
  | 'php'
  | 'ruby'
  | 'go';

export type SdkActionIconName = 'download' | 'arrow-right' | 'external' | 'book' | 'code' | 'terminal';

export type SdkActionVariant = 'primary' | 'secondary' | 'link';

export type SdkActionIconPosition = 'start' | 'end';

export interface SdkAction {
  label: ReactNode;
  href: string;
  external?: boolean;
  variant?: SdkActionVariant;
  icon?: SdkActionIconName | ReactNode;
  iconPosition?: SdkActionIconPosition;
}

export interface SdkInstall {
  command: string;
  title?: ReactNode;
}

export interface Sdk {
  id?: string;
  name: ReactNode;
  description?: ReactNode;
  icon?: SdkIconName | ReactNode;
  install?: string | SdkInstall;
  actions?: SdkAction[];
  links?: SdkAction[];
}

export interface SdkVisibilityProps {
  showIcon?: boolean;
  showDescription?: boolean;
  showInstall?: boolean;
  showActions?: boolean;
  showLinks?: boolean;
}

export interface SdkCardProps extends Sdk, SdkVisibilityProps {
  className?: string;
}

export type SdkColumns = 1 | 2 | 3 | 4;

export interface SdkGridProps extends SdkVisibilityProps {
  children?: ReactNode;
  sdks?: Sdk[];
  columns?: SdkColumns;
  minCardWidth?: string;
  empty?: ReactNode;
  className?: string;
}

export type SdkActionInput = string | (Partial<Omit<SdkAction, 'href'>> & { href: string });

export interface SdkActionsProps {
  icon?: SdkIconName | ReactNode;
  registry?: ReactNode;
  version?: ReactNode;
  download?: SdkActionInput;
  package?: SdkActionInput;
  source?: SdkActionInput;
  actions?: SdkAction[];
  className?: string;
}
