// How React 19.2 hands the browser a part of a page that threw on the server, where it throws again: marked
// `<!--$!-->` when it threw before the page was sent, and switched by an `$RX("…")` call when it threw after.
// The prerender asks as a bot, so React waits for the whole page and only the first appears; `$RX` is for a
// prerender that streams.
const FAILED_BOUNDARY = /<!--\$!-->|\$RX\("/;

// How TanStack reports an error React caught while rendering, which it writes to the console and nowhere else.
const RENDER_ERROR = /^Error in renderTo\w+Stream:/;

interface PrerenderedPage {
  page: { path: string };
  html: string;
}

/**
 * The prerender's `onSuccess`: fails the build over a page that would show readers an error screen, which it
 * otherwise ships as blank, with the errors the server reported while rendering.
 */
export function refuseFailedRenders(output: Pick<Console, 'error'> = console): (prerendered: PrerenderedPage) => void {
  const errors: string[] = [];
  const write = output.error.bind(output);
  output.error = (...data: unknown[]) => {
    if (typeof data[0] === 'string' && RENDER_ERROR.test(data[0])) {
      errors.push(firstLine(data[1]));
    }
    write(...data);
  };

  return ({ page, html }) => {
    if (!FAILED_BOUNDARY.test(html)) {
      return;
    }
    // Every error so far, not only this page's: the build stops at the first page refused, and the others are next.
    const reported =
      errors.length === 0 ? 'Its error is in the build log.' : `The server reported: ${errors.join('\n')}`;
    throw new Error(`${page.path} failed to render, so readers would see an error in its place. ${reported}`);
  };
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0];
}
