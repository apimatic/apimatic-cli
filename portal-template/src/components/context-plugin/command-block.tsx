"use client";

import type { ReactNode } from "react";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { cn } from "@/lib/cn";
import { CopyCommandButton } from "./copy-command-button";
import { useOrigin } from "./hooks/use-origin";
import { withOrigin } from "./lib/with-origin";

export function ContextPluginCommandBlock({
  command,
  title,
}: {
  command: string;
  title?: ReactNode;
}) {
  // One resolved string for block and clipboard, so what is copied is what is shown.
  const resolved = withOrigin(command, useOrigin());

  return (
    <CodeBlock
      title={title}
      allowCopy={false}
      className="my-0 rounded-lg"
      viewportProps={{ className: "py-2.5" }}
      Actions={({ className }) => (
        <div className={cn("empty:hidden", className)}>
          <CopyCommandButton command={resolved} />
        </div>
      )}
    >
      {/* `Pre` flexes every child element, so this must stay a bare text node. */}
      <Pre className="pl-4 pr-10">{resolved}</Pre>
    </CodeBlock>
  );
}
