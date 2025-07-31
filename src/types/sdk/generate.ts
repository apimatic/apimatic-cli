export type GenerationIdParams = {
  file: string;
  url: string;
  platform: string;
};

export type DownloadSDKParams = {
  codeGenId: string;
  zip: boolean;
  zippedSDKPath: string;
  sdkFolderPath: string;
};

export type SDKGenerateUnprocessableError = {
  message: string;
};

export enum LanguagePlatform {
  CSHARP = "csharp",
  JAVA = "java",
  PHP = "php",
  PYTHON = "python",
  RUBY = "ruby",
  TYPESCRIPT = "typescript",
  GO = "go"
}
