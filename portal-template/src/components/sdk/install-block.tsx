'use client';

import type { ReactNode } from 'react';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import { cn } from '@/lib/cn';
import { CopyCommandButton } from './copy-command-button';

export function SdkInstallBlock({ command, title }: { command: string; title?: ReactNode }) {
  return (
    <CodeBlock
      title={title}
      allowCopy={false}
      className="my-0 rounded-lg"
      viewportProps={{ className: 'py-2.5' }}
      Actions={({ className }) => (
        <div
          className={cn(
            'empty:hidden',
            className,
            'top-0 right-0 flex h-full items-center bg-fd-card px-2',
          )}
        >
          <CopyCommandButton command={command} />
        </div>
      )}
    >
      <Pre className="pl-4 pr-10" title={command}>
        {command}
      </Pre>
    </CodeBlock>
  );
}
