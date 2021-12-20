export type GetImportParams = {
  file: string;
  url: string;
  fork: boolean;
  replace: boolean;
  version: string;
  "api-group": string;
  "api-entity": string;
  "auth-key": string | undefined;
};
