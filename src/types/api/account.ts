export interface SubscriptionInfo {
  Id: string;
  Email: string;
  FullName: string;
  SecurityStamp: string;
  tenantId: string;
  allowedLanguages: number; // might be a comma-separated string or code — clarify if needed
  isPackagePublishingAllowed: boolean;
  isOnPremGenerationAllowed: boolean;
  ApiCopilotKeys: string[];
}
