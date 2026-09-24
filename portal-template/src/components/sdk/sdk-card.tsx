import { Card } from 'fumadocs-ui/components/card';
import { cn } from '@/lib/cn';
import { SdkCardActions } from './card-actions';
import { SdkCardLinks } from './card-links';
import { SdkCardTitle } from './card-title';
import { SdkInstallBlock } from './install-block';
import type { SdkCardProps } from './types';
import { isPresent, normalizeInstall } from './utils';

export function SdkCard({
  name,
  description,
  icon,
  install,
  actions = [],
  links = [],
  showIcon = true,
  showDescription = true,
  showInstall = true,
  showActions = true,
  showLinks = true,
  className,
}: SdkCardProps) {
  const resolvedInstall = showInstall ? normalizeInstall(install) : undefined;
  const visibleActions = showActions ? actions : [];
  const visibleLinks = showLinks ? links : [];
  const hasBody = Boolean(resolvedInstall) || visibleActions.length > 0 || visibleLinks.length > 0;

  return (
    <Card
      className={cn(
        'min-w-0',
        '[&>h3]:mb-0 [&>p]:mt-3! [&>p]:mb-0!',
        '[&>div:last-child]:mt-4 [&>div:last-child]:flex [&>div:last-child]:flex-col [&>div:last-child]:gap-4',
        className,
      )}
      title={<SdkCardTitle name={name} icon={icon} showIcon={showIcon} />}
      description={showDescription && isPresent(description) ? description : undefined}
    >
      {hasBody ? (
        <>
          {resolvedInstall ? (
            <SdkInstallBlock command={resolvedInstall.command} title={resolvedInstall.title} />
          ) : null}
          <SdkCardActions actions={visibleActions} />
          <SdkCardLinks links={visibleLinks} />
        </>
      ) : null}
    </Card>
  );
}
