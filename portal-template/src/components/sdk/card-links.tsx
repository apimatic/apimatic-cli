import { ActionLink } from './action-link';
import type { SdkAction } from './types';
import { isExternal } from './utils';

export function SdkCardLinks({ links }: { links: SdkAction[] }) {
  if (links.length === 0) return null;

  return (
    <div className="-mx-4 -mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 pt-3 pb-3.5">
      {links.map((link) => (
        <ActionLink
          key={link.href}
          action={link}
          variant="muted"
          defaultIcon={isExternal(link) ? 'external' : 'arrow-right'}
        />
      ))}
    </div>
  );
}
