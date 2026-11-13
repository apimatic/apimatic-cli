/** The opt-out markers of the session replay tools a GTM tag may load; each keeps its tool out of the element. */
export const REPLAY_MARKERS = {
  className: 'ph-no-capture fs-exclude rr-block amp-block',
  'data-hj-suppress': '',
  'data-clarity-mask': 'True',
  'data-private': '',
  'data-portal-playground': ''
} as const;

function markForReplay(element: Element): void {
  element.classList.add(...REPLAY_MARKERS.className.split(' '));
  for (const [name, value] of Object.entries(REPLAY_MARKERS)) {
    if (name !== 'className') element.setAttribute(name, value);
  }
}

/**
 * Marks the playground's dialog, which Fumadocs renders outside the marked wrapper, as it appears: observers are told
 * in the order they were made, so this one, made before any vendor tag, marks it before a replay tool's records it.
 */
export function markPlaygroundDialogs(): void {
  new MutationObserver((mutations) => {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (!(node instanceof Element)) continue;
        // Told from the search dialog by its request form, until fuma-nama/fumadocs#3824 takes the markers itself.
        const dialog = node.matches('[role="dialog"]') ? node : node.querySelector('[role="dialog"]');
        if (dialog !== null && dialog.querySelector('form') !== null) markForReplay(dialog);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
