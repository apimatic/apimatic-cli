import { useEffect } from 'react';
import { useOperation } from 'fumadocs-openapi/operation';
import PlaygroundClient, { DefaultResultDisplay, type ResultDisplayProps } from 'fumadocs-openapi/ui/playground/client';
import { analytics } from '@/lib/portal-analytics';
import { markForReplay } from '@/lib/replay-markers';

// Fumadocs' request has no callback of its own: the start is noted here, and the request goes on unchanged.
const fetchOptions = {
  onRequestInit: (requestInit: RequestInit) => {
    analytics.requestStarted();
    return requestInit;
  }
};

/** Fumadocs' result display, reporting each result once: the effect runs per result object, not per render. */
function ResultDisplay(props: ResultDisplayProps) {
  const { method, path } = useOperation();
  useEffect(
    () => analytics.reportApiRequest(`${method.toUpperCase()} ${path}`, props.data),
    [method, path, props.data]
  );
  return <DefaultResultDisplay {...props} />;
}

const components = { ResultDisplay };

/** The playground with the reporting around it, in the one chunk the API page loads lazily. */
export default function Playground() {
  // Fumadocs renders the dialog outside the marked wrapper, so each dialog is marked as it appears,
  // until fuma-nama/fumadocs#3824 lets the markers be passed to the dialog directly.
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const { addedNodes } of mutations) {
        for (const node of addedNodes) {
          if (!(node instanceof Element)) continue;
          const dialog = node.matches('[role="dialog"]') ? node : node.querySelector('[role="dialog"]');
          if (dialog !== null) markForReplay(dialog);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return <PlaygroundClient fetchOptions={fetchOptions} components={components} />;
}
