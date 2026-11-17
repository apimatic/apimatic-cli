import { expect } from 'chai';
import sinon from 'sinon';
import { EventFeed, PortalEvent } from '../../portal-template/src/lib/event-feed';

describe('EventFeed', () => {
  const NOW = 1_763_280_000_000;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers({ now: NOW, toFake: ['setTimeout', 'Date'] });
  });

  afterEach(() => clock.restore());

  /** Events from before a subscription arrive on a microtask, once `subscribe()` has returned. */
  const settled = () => Promise.resolve();
  const names = (events: PortalEvent[]) => events.map((event) => event.name);
  const collect = (feed: EventFeed) => {
    const events: PortalEvent[] = [];
    feed.subscribe((event) => events.push(event));
    return events;
  };

  it('hands a subscriber every event so far, in order, and then each new one as it is published', async () => {
    const feed = new EventFeed();
    feed.publish('docs_page_view', { page_title: 'Home' });
    feed.publish('docs_search', { search_term: 'pets' });

    const events = collect(feed);
    await settled();
    expect(names(events)).to.deep.equal(['docs_page_view', 'docs_search']);

    feed.publish('docs_code_copy', { language: 'python' });
    expect(names(events)).to.deep.equal(['docs_page_view', 'docs_search', 'docs_code_copy']);
  });

  // A script's `const stop = subscribe(…)` has no value yet while subscribe() is still running.
  it('hands over nothing before subscribe() has returned', async () => {
    const feed = new EventFeed();
    feed.publish('docs_page_view', {});

    const events = collect(feed);

    expect(events).to.be.empty;
    await settled();
    expect(names(events)).to.deep.equal(['docs_page_view']);
  });

  it('keeps the order, and repeats nothing, when an event is published before the earlier ones were handed over', async () => {
    const feed = new EventFeed();
    feed.publish('docs_page_view', {});

    const events = collect(feed);
    feed.publish('docs_search', {});
    await settled();

    expect(names(events)).to.deep.equal(['docs_page_view', 'docs_search']);
  });

  // Customers' scripts read these. They are plain text here, so a new or renamed key is a change made on purpose.
  it('gives an event exactly these keys, and version 1', async () => {
    const feed = new EventFeed();
    feed.publish('docs_code_copy', { language: 'python', page_location: 'https://docs.test/' });

    const events = collect(feed);
    await settled();

    expect(Object.keys(events[0])).to.deep.equal(['name', 'params', 'time', 'version']);
    expect(events[0]).to.deep.equal({
      name: 'docs_code_copy',
      params: { language: 'python', page_location: 'https://docs.test/' },
      time: NOW,
      version: 1
    });
  });

  it('freezes the event and its details, and leaves the details it was given as they were', async () => {
    const feed = new EventFeed();
    const given = { language: 'python' };
    feed.publish('docs_code_copy', given);

    const events = collect(feed);
    await settled();

    expect(Object.isFrozen(events[0])).to.be.true;
    expect(Object.isFrozen(events[0].params)).to.be.true;
    expect(events[0].params).to.not.equal(given);
    expect(Object.isFrozen(given)).to.be.false;
  });

  it('carries on past a subscriber that throws, and shows its error on the next timer tick', async () => {
    const feed = new EventFeed();
    const failure = new Error('the forwarder broke');
    feed.subscribe(() => {
      throw failure;
    });
    const events = collect(feed);

    feed.publish('docs_page_view', {});
    feed.publish('docs_search', {});
    await settled();

    expect(names(events)).to.deep.equal(['docs_page_view', 'docs_search']);
    expect(() => clock.next()).to.throw(failure);
  });

  it('stops delivering when the returned function is called', async () => {
    const feed = new EventFeed();
    const events: PortalEvent[] = [];
    const stop = feed.subscribe((event) => events.push(event));

    feed.publish('docs_page_view', {});
    stop();
    feed.publish('docs_search', {});
    await settled();

    expect(names(events)).to.deep.equal(['docs_page_view']);
  });

  it('stops for a callback that calls it on the first event it gets, one from before it subscribed', async () => {
    const feed = new EventFeed();
    feed.publish('docs_page_view', {});
    feed.publish('docs_search', {});
    const events: PortalEvent[] = [];

    const stop = feed.subscribe((event) => {
      events.push(event);
      stop();
    });
    await settled();
    feed.publish('docs_code_copy', {});

    expect(names(events)).to.deep.equal(['docs_page_view']);
    expect(clock.countTimers()).to.equal(0);
  });

  it('hands a subscriber added from inside a callback every event once, in order, and none before its subscribe() returned', async () => {
    const feed = new EventFeed();
    const inner: string[] = [];
    let innerWhenSubscribeReturned: number | undefined;
    feed.subscribe(() => {
      if (innerWhenSubscribeReturned !== undefined) return;
      feed.subscribe((event) => inner.push(event.name));
      innerWhenSubscribeReturned = inner.length;
    });

    feed.publish('docs_page_view', {});
    feed.publish('docs_search', {});
    await settled();

    expect(innerWhenSubscribeReturned).to.equal(0);
    expect(inner).to.deep.equal(['docs_page_view', 'docs_search']);
  });

  it('skips a subscriber that an earlier one removed while the same event was being handed over', async () => {
    const feed = new EventFeed();
    const second: string[] = [];
    let stopSecond: () => void = () => undefined;
    feed.subscribe(() => stopSecond());
    stopSecond = feed.subscribe((event) => second.push(event.name));

    feed.publish('docs_page_view', {});
    await settled();

    expect(second).to.be.empty;
  });

  it('refuses at once what is not a function, by the name a script calls it by', () => {
    const feed = new EventFeed();

    // @ts-expect-error A script in the page is not type-checked.
    expect(() => feed.subscribe('docs_page_view')).to.throw(
      TypeError,
      'window.apimatic.analytics.subscribe() takes a function.'
    );
  });
});
