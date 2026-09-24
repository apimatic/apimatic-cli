import { Children, cloneElement, isValidElement, type CSSProperties } from 'react';
import { Cards } from 'fumadocs-ui/components/card';
import { cn } from '@/lib/cn';
import { defaultSdks } from './data';
import { SdkCard } from './sdk-card';
import type { SdkGridProps, SdkVisibilityProps } from './types';

function gridStyle({ columns, minCardWidth = '17rem' }: Pick<SdkGridProps, 'columns' | 'minCardWidth'>): CSSProperties {
  // A fixed count when asked for, otherwise as many columns of at least
  // `minCardWidth` as fit. Either way `<Card>` carries `@max-lg:col-span-full`,
  // so every layout still collapses to one column on a narrow container.
  return {
    gridTemplateColumns: columns
      ? `repeat(${columns}, minmax(0, 1fr))`
      : `repeat(auto-fill, minmax(min(${minCardWidth}, 100%), 1fr))`,
  };
}

export function SdkGrid({
  children,
  sdks,
  columns,
  minCardWidth,
  empty,
  className,
  ...visibility
}: SdkGridProps) {
  const hasChildren = Children.count(children) > 0;

  // Children win over `sdks`, and inherit the grid's `show*` props. Spreading
  // `child.props` last means anything set on the card itself still wins — a
  // child that never mentions `showInstall` simply has no such key.
  const cards = hasChildren
    ? Children.map(children, (child) =>
        isValidElement<SdkVisibilityProps>(child)
          ? cloneElement(child, { ...visibility, ...child.props })
          : child,
      )
    : (sdks ?? defaultSdks).map((sdk, index) => (
        <SdkCard key={sdk.id ?? index} {...sdk} {...visibility} />
      ));

  if (!hasChildren && (sdks ?? defaultSdks).length === 0) {
    return empty ? <div className="text-sm text-fd-muted-foreground">{empty}</div> : null;
  }

  return (
    <Cards className={cn('not-prose items-start', className)} style={gridStyle({ columns, minCardWidth })}>
      {cards}
    </Cards>
  );
}
