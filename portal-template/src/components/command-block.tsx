import { asMarkdown } from 'fumadocs-core/server';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';

/** One shell command in a copyable block: an MDX page has no highlighter to hand, so it is plain. */
export function CommandBlock({ command, className }: Readonly<{ command: string; className?: string }>) {
  if (asMarkdown()) {
    return `\`\`\`bash\n${command}\n\`\`\``;
  }
  return (
    <CodeBlock className={className}>
      <Pre>
        <code>
          {/* A highlighted block's lines carry this class, which is what the block pads. */}
          <span className="line">{command}</span>
        </code>
      </Pre>
    </CodeBlock>
  );
}
