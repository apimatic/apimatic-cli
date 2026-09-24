import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** The rounded square a brand mark sits in — shared by the cards and the page bar. */
export function SdkIconChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-lg border bg-fd-muted text-fd-muted-foreground shadow-md [&_svg]:size-5',
        className,
      )}
    >
      {children}
    </span>
  );
}
