import { useEffect } from 'react';
import { useOperation } from 'fumadocs-openapi/operation';
import PlaygroundClient, { DefaultResultDisplay, type ResultDisplayProps } from 'fumadocs-openapi/ui/playground/client';
import { analytics } from '@/lib/portal-analytics';

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
  return <PlaygroundClient fetchOptions={fetchOptions} components={components} />;
}
