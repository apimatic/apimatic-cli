type SdkLanguage = "CSharp" | "Java" | "Php" | "Python" | "Ruby" | "TypeScript";

type PublishType = "Package" | "SourceCode";

type PublishEventType = "Queued" | "InProgress" | "Succeeded" | "Failed" | "Exception" | "InternalError";

export interface PublishLogEventItem {
  sdkLanguage: SdkLanguage;
  languageVersion: string;
  publishType: PublishType;
  eventType: PublishEventType;
  inProgressTimeStamp: string | null;
  timeStamp: string;
  logUrl: string | null;
  sdkUrl: string | null;
  packageUrl: string | null;
  sourceUrl: string | null;
}

export interface PublishLogItem {
  publishLogId: string;
  events: PublishLogEventItem[];
}
