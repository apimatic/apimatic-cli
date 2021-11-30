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

export enum SimplePlatforms {
  CSHARP = "CS_NET_STANDARD_LIB",
  JAVA = "JAVA_ECLIPSE_JRE_LIB",
  PHP = "PHP_GENERIC_LIB",
  PYTHON = "PYTHON_GENERIC_LIB",
  RUBY = "RUBY_GENERIC_LIB",
  TYPESCRIPT = "TS_GENERIC_LIB"
}
