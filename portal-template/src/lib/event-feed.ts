/** One portal event as a subscriber receives it. Customers' scripts read these keys, so `version` moves if one ever changes. */
export interface PortalEvent {
  readonly name: string;
  /** The event's details, with `page_location` among them. */
  readonly params: Readonly<Record<string, string | number>>;
  /** When it was reported, in milliseconds since the epoch. */
  readonly time: number;
  readonly version: 1;
}

type Subscriber = (event: PortalEvent) => void;
type Unsubscribe = () => void;

interface Subscription {
  callback: Subscriber;
  deliveredCount: number;
}

/** A page's events, for the scripts on it: a subscriber gets every one reported so far, then each new one. */
export class EventFeed {
  private readonly events: PortalEvent[] = [];
  private readonly subscriptions = new Set<Subscription>();

  public subscribe(callback: Subscriber): Unsubscribe {
    if (typeof callback !== 'function') {
      throw new TypeError('window.apimatic.analytics.subscribe() takes a function.');
    }
    const subscription: Subscription = { callback, deliveredCount: 0 };
    this.subscriptions.add(subscription);
    // Once this has returned, so a callback can call the function it returns, even for an earlier event.
    queueMicrotask(() => EventFeed.deliver(this, subscription));
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  public publish(name: string, params: Record<string, string | number>): void {
    // A copy, frozen, so no subscriber changes what the next one gets, or what the data layer was handed.
    this.events.push(Object.freeze({ name, params: Object.freeze({ ...params }), time: Date.now(), version: 1 }));
    // The set itself: one a callback adds is reached in this same pass, and one it removes is skipped.
    for (const subscription of this.subscriptions) EventFeed.deliver(this, subscription);
  }

  private static deliver(feed: EventFeed, subscription: Subscription): void {
    // Called on its own, so a callback written without strict mode finds the window as `this`, never this record.
    const { callback } = subscription;
    while (feed.subscriptions.has(subscription) && subscription.deliveredCount < feed.events.length) {
      const event = feed.events[subscription.deliveredCount];
      subscription.deliveredCount += 1;
      try {
        callback(event);
      } catch (error) {
        // Thrown later, so it shows in the console and stops neither the next event nor the next subscriber.
        setTimeout(() => {
          throw error;
        });
      }
    }
  }
}
