/** The opt-out markers of the session replay tools a GTM tag may load; each keeps its tool out of the element. */
export const REPLAY_MARKERS = {
  className: 'ph-no-capture fs-exclude rr-block amp-block',
  'data-hj-suppress': '',
  'data-clarity-mask': 'True',
  'data-private': '',
  'data-portal-playground': ''
} as const;

/** The same markers on an element Fumadocs renders outside the wrapper, such as the playground's dialog. */
export function markForReplay(element: Element): void {
  element.classList.add(...REPLAY_MARKERS.className.split(' '));
  for (const [name, value] of Object.entries(REPLAY_MARKERS)) {
    if (name !== 'className') element.setAttribute(name, value);
  }
}
