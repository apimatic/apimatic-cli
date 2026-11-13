import { createContext, use, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useOperation } from 'fumadocs-openapi/operation';
import type { FetchResult } from 'fumadocs-openapi/playground';
import PlaygroundClient, { DefaultResultDisplay, type ResultDisplayProps } from 'fumadocs-openapi/ui/playground/client';
import { apiRequest } from '@/lib/api-request';
import { analytics } from '@/lib/portal-analytics';
import { markForReplay } from '@/lib/replay-markers';

/** When this playground last sent a request, for a result that has no duration of its own. */
const SentAt = createContext<RefObject<number | null>>({ current: null });

// The display mounts again with the same result on each reopen, and twice in a dev build.
const reported = new WeakSet<FetchResult>();

function ResultDisplay(props: ResultDisplayProps) {
  const { method, path } = useOperation();
  const sentAt = use(SentAt);
  useEffect(() => {
    if (reported.has(props.data)) return;
    reported.add(props.data);
    const endpoint = `${method.toUpperCase()} ${path}`;
    analytics.report('docs_api_request', apiRequest(endpoint, props.data, sentAt.current, Date.now()));
    sentAt.current = null;
  }, [method, path, props.data, sentAt]);
  return <DefaultResultDisplay {...props} />;
}

const components = { ResultDisplay };

/** The playground with the reporting around it, in the one chunk the API page loads lazily. */
export default function Playground() {
  const sentAt = useRef<number | null>(null);
  // Fumadocs' request has no callback of its own: the time is noted here, and the request goes on unchanged.
  const fetchOptions = useMemo(
    () => ({
      onRequestInit: (requestInit: RequestInit) => {
        sentAt.current = Date.now();
        return requestInit;
      }
    }),
    []
  );
  // Fumadocs renders the dialog outside the marked wrapper, so it is marked as it appears, told from the search
  // dialog by the request form in it, until fuma-nama/fumadocs#3824 lets the markers be passed to the dialog directly.
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const { addedNodes } of mutations) {
        for (const node of addedNodes) {
          if (!(node instanceof Element)) continue;
          const dialog = node.matches('[role="dialog"]') ? node : node.querySelector('[role="dialog"]');
          if (dialog !== null && dialog.querySelector('form') !== null) markForReplay(dialog);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return (
    <SentAt value={sentAt}>
      <PlaygroundClient fetchOptions={fetchOptions} components={components} />
    </SentAt>
  );
}
