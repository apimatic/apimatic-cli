export type DownloadSDKParams = {
  zip: boolean;
  force: boolean;
  destination: string;
  "auth-key": string;
  "codegen-id": string;
  "api-entity": string | undefined;
};
