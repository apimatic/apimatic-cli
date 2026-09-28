import { asMarkdown } from 'fumadocs-core/server';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import { CODE_BLOCK_TITLES } from '@/lib/code-titles';

interface CommandBlockProps {
  command: string;
  /** One line that truncates, for a card; the full command is still what the button copies. */
  compact?: boolean;
}

/** One shell command in a copyable block: an MDX page has no highlighter to hand, so it is plain. */
export function CommandBlock({ command, compact = false }: Readonly<CommandBlockProps>) {
  if (asMarkdown()) {
    return `\`\`\`bash\n${command}\n\`\`\``;
  }
  if (!compact) {
    return (
      <CodeBlock title={CODE_BLOCK_TITLES.shellscript}>
        <Pre>
          <code>
            {/* A highlighted block's lines carry this class, which is what the block pads. */}
            <span className="line">{command}</span>
          </code>
        </Pre>
      </CodeBlock>
    );
  }
  return (
    <CodeBlock
      className="my-0 rounded-lg bg-fd-secondary shadow-none"
      viewportProps={{ className: 'py-2 text-xs' }}
      // Centred on the one line, where the block's own placement pins the button to the top corner.
      Actions={({ children }) => (
        <div className="absolute inset-y-0 end-1.5 z-2 flex items-center text-fd-muted-foreground">{children}</div>
      )}
    >
      <Pre className="w-full">
        <code>
          {/* The block pads a line only as far as the button's edge, so a cut-off command would run up to it. */}
          <span className="line truncate [--padding-right:calc(var(--spacing)*10)]" title={command}>
            {command}
          </span>
        </code>
      </Pre>
    </CodeBlock>
  );
}
