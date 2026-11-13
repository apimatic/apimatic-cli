import type { PortalEvents } from './analytics';

/** The search dialog on a render after it opened. */
export interface SearchDialogState {
  open: boolean;
  /** The last keystrokes' results are still on their way. */
  loading: boolean;
  typed: boolean;
  /** The address of the result picked, or empty. */
  picked: string;
  term: string;
  resultCount: number;
}

export type SearchOutcome = { ended: false } | { ended: true; report: PortalEvents['docs_search'] | null };

/** A search ends once the dialog has closed with its results in; it reports when the reader typed or picked a term. */
export function searchOutcome(state: SearchDialogState): SearchOutcome {
  if (state.open || state.loading) return { ended: false };
  const search_term = state.term.trim();
  const counted = (state.typed || state.picked !== '') && search_term !== '';
  return {
    ended: true,
    report: counted ? { search_term, result: state.picked, result_count: state.resultCount } : null
  };
}
