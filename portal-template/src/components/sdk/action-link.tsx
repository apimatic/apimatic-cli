import type { ReactNode } from 'react';
import Link from 'fumadocs-core/link';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { cn } from '@/lib/cn';
import { resolveActionIcon } from './icons';
import type { SdkAction } from './types';
import { isExternal } from './utils';

export type ActionVariant = NonNullable<SdkAction['variant']> | 'muted';

const variantClasses: Record<ActionVariant, string> = {
  primary: buttonVariants({ variant: 'primary', size: 'sm', className: 'gap-2 px-2.5 hover:opacity-90' }),
  secondary: buttonVariants({ variant: 'secondary', size: 'sm', className: 'gap-2 px-2.5' }),
  link: 'inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80',
  muted:
    'inline-flex items-center gap-1.5 text-xs font-normal text-fd-muted-foreground transition-colors hover:text-fd-foreground',
};

export function ActionLink({
  action,
  variant,
  className,
  defaultIcon,
}: {
  action: SdkAction;
  variant: ActionVariant;
  className?: string;
  defaultIcon?: ReactNode;
}) {
  const icon = resolveActionIcon(action.icon ?? defaultIcon);
  const leading = action.iconPosition === 'start';

  return (
    <Link
      href={action.href}
      external={isExternal(action)}
      className={cn(variantClasses[variant], className)}
    >
      {leading ? icon : null}
      {action.label}
      {leading ? null : icon}
    </Link>
  );
}
