import { expect } from 'chai';
import { linkTarget } from '../../portal-template/src/lib/link-target';

describe('linkTarget', () => {
  it('takes a link to a section apart into its page and its heading', () => {
    expect(linkTarget('/errors#status-codes')).to.deep.equal({ to: '/errors', hash: 'status-codes' });
    expect(linkTarget('/#what-you-can-do')).to.deep.equal({ to: '/', hash: 'what-you-can-do' });
  });

  it('leaves a link to a page as it is, and drops an empty heading', () => {
    expect(linkTarget('/guides/rate-limits')).to.deep.equal({ to: '/guides/rate-limits' });
    expect(linkTarget('/errors#')).to.deep.equal({ to: '/errors' });
  });

  // What hovering a link preloads: the page the router places it on.
  it('places a link to a section on its page, where the whole link names a page that does not exist', async () => {
    // Their ES module builds: the CommonJS ones warn of a circular require when loaded.
    const { createMemoryHistory, createRootRoute, createRouter } = await import('@tanstack/react-router');
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory({ initialEntries: ['/'] })
    });

    const split = router.buildLocation(linkTarget('/errors#status-codes'));
    const whole = router.buildLocation({ to: '/errors#status-codes' });

    expect({ pathname: split.pathname, hash: split.hash }).to.deep.equal({ pathname: '/errors', hash: 'status-codes' });
    expect(whole.pathname).to.equal('/errors#status-codes');
  });
});
