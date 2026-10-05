import { useEffect, useState } from 'react';
import { useTranslations } from '@fuma-translate/react';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { Check, Copy, X } from 'lucide-react';
import { copyMarkdown } from '@/lib/copy-markdown';

type CopyState = 'idle' | 'copying' | 'copied' | 'failed';

export function MarkdownCopyButton({ markdownUrl }: Readonly<{ markdownUrl: string }>) {
  const [state, setState] = useState<CopyState>('idle');
  // fumadocs' own keys and note, so translations given for its button apply to this one.
  const t = useTranslations({ note: 'page actions' });
  const labels: Record<CopyState, string> = {
    idle: t('Copy Markdown'),
    copying: t('Copy Markdown'),
    copied: t('Copied Markdown'),
    failed: t('Copy failed')
  };

  useEffect(() => {
    if (state !== 'copied') return;
    const timeout = window.setTimeout(() => setState('idle'), 1500);
    return () => window.clearTimeout(timeout);
  }, [state]);

  const copy = () => {
    setState('copying');
    copyMarkdown(markdownUrl, import.meta.env.BASE_URL).then(
      () => setState('copied'),
      (error: unknown) => {
        console.error(error);
        setState('failed');
      }
    );
  };

  return (
    <>
      <button
        type="button"
        disabled={state === 'copying'}
        onClick={copy}
        className={buttonVariants({
          color: 'secondary',
          size: 'sm',
          className: 'gap-2 [&_svg]:size-3.5 [&_svg]:text-fd-muted-foreground'
        })}
      >
        <StateIcon state={state} />
        {labels[state]}
      </button>
      {/* Screen readers don't reliably announce a change to the focused button's own text,
          so the result goes to a live region: <output> is one, with the status role. */}
      <output className="sr-only">{state === 'copied' || state === 'failed' ? labels[state] : ''}</output>
    </>
  );
}

function StateIcon({ state }: Readonly<{ state: CopyState }>) {
  if (state === 'copied') return <Check />;
  if (state === 'failed') return <X />;
  return <Copy />;
}
