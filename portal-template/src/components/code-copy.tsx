import type { CodeBlockProps as BlockProps } from 'fumadocs-ui/components/codeblock';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import type { CodeBlockProps } from 'fumadocs-openapi';
import { languageId } from '@/lib/languages';
import { analytics } from '@/lib/portal-analytics';

type Actions = NonNullable<BlockProps['Actions']>;

export const reportCodeCopy = (language: string) =>
  analytics.report('docs_code_copy', { language: languageId(language) });

// Fumadocs' own, which any Actions a block is given replaces.
const DefaultActions: Actions = ({ className, children }) => (
  <div className={className ? `empty:hidden ${className}` : 'empty:hidden'}>{children}</div>
);

/** A block's Actions slot, which Fumadocs hands the copy button: a click on it calls `onCopy`. */
export function reportCopies(onCopy: () => void, Actions: Actions = DefaultActions): Actions {
  return ({ className, children }) =>
    Actions({
      className,
      children: children && (
        <span className="contents" onClickCapture={onCopy}>
          {children}
        </span>
      )
    });
}

/** Fumadocs' highlighted block, as the API reference renders each, reporting its copies with its language. */
export function ReportedCodeBlock({ codeblock, ...props }: CodeBlockProps) {
  const Actions = reportCopies(() => reportCodeCopy(props.lang), codeblock?.Actions);
  return <DynamicCodeBlock {...props} codeblock={{ ...codeblock, Actions }} />;
}
