import { pageLocation, type PortalEvents } from './analytics';

/** The search dialog on a render after it opened. */
export interface SearchDialogState {
  open: boolean;
  /** The last keystrokes' results are still on their way. */
  loading: boolean;
  typed: boolean;
  /** The whole address of the result picked, or empty. */
  picked: string;
  term: string;
  resultCount: number;
}

export type SearchOutcome = { ended: false } | { ended: true; report: PortalEvents['docs_search'] | null };

/** What GA4 keeps of a parameter's value, so no other tag gets more of what a reader pasted into search. */
const TERM_LIMIT = 100;

/** A search ends once the dialog has closed with its results in; it reports when the reader typed or picked a term. */
export function searchOutcome(state: SearchDialogState): SearchOutcome {
  if (state.open || state.loading) return { ended: false };
  const search_term = state.term.trim().slice(0, TERM_LIMIT);
  const counted = (state.typed || state.picked !== '') && search_term !== '';
  // In the shape of `page_location`, so a report joins the two: a heading hit loses its `#` part.
  const result = state.picked === '' ? '' : pageLocation(state.picked, []);
  return { ended: true, report: counted ? { search_term, result, result_count: state.resultCount } : null };
}
