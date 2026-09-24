import { SdkIconChip } from './icon-chip';
import { FallbackSdkIcon, resolveSdkIcon } from './icons';
import type { Sdk } from './types';
import { isPresent } from './utils';

export function SdkCardTitle({
  name,
  icon,
  showIcon = true,
}: Pick<Sdk, 'name' | 'icon'> & { showIcon?: boolean }) {
  const named = isPresent(name);
  const mark =
    (showIcon ? resolveSdkIcon(icon) : null) ??
    (showIcon && named ? <FallbackSdkIcon aria-hidden /> : null);

  if (!mark) return named ? name : null;

  return (
    <span className="flex items-center gap-3">
      <SdkIconChip>{mark}</SdkIconChip>
      {named ? (
        <span className="min-w-0 text-base leading-tight font-semibold wrap-break-word">{name}</span>
      ) : null}
    </span>
  );
}
