import { SubscriptionInfo } from './account.js';

/** A subscription feature the CLI checks before it does the work the feature pays for. */
export type SubscriptionFeature = 'portalGeneration' | 'askAi';

/** What the account's subscription allows, as its profile reports it. */
export class AccountEntitlements {
  private constructor(private readonly features: ReadonlySet<SubscriptionFeature>) {}

  public static of(account: SubscriptionInfo): AccountEntitlements {
    const features = new Set<SubscriptionFeature>();
    if (account.isOnPremGenerationAllowed) features.add('portalGeneration');
    // A platform without the flag answers without it, which grants nothing.
    if (account.isApiCopilotAllowed === true) features.add('askAi');
    return new AccountEntitlements(features);
  }

  public includes(feature: SubscriptionFeature): boolean {
    return this.features.has(feature);
  }
}
