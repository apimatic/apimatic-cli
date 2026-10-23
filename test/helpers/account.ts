import { AccountEntitlements, SubscriptionFeature } from '../../src/types/api/account-entitlements';
import { SubscriptionInfo } from '../../src/types/api/account';

/** The account profile the platform answers with, granting the features named. */
export function profileWith(...features: SubscriptionFeature[]): SubscriptionInfo {
  return {
    Id: 'id',
    Email: 'user@example.com',
    FullName: 'User',
    SecurityStamp: '',
    tenantId: 'tenant',
    allowedLanguages: 0,
    isPackagePublishingAllowed: true,
    isOnPremGenerationAllowed: features.includes('portalGeneration'),
    isApiCopilotAllowed: features.includes('askAi'),
    ApiCopilotKeys: []
  };
}

export function entitlementsWith(...features: SubscriptionFeature[]): AccountEntitlements {
  return AccountEntitlements.of(profileWith(...features));
}
