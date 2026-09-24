import { ActionLink } from './action-link';
import type { SdkAction } from './types';

export function SdkCardActions({ actions }: { actions: SdkAction[] }) {
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {actions.map((action) => {
        const variant = action.variant ?? 'link';

        return (
          <ActionLink
            key={action.href}
            action={action}
            variant={variant}
            defaultIcon={variant === 'link' ? 'arrow-right' : undefined}
          />
        );
      })}
    </div>
  );
}
