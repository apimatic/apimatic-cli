export const baseURL = "https://api.apimatic.io";
export const staticPortalRepoUrl = "https://github.com/apimatic/static-portal-workflow.git";
export const metadataFileContent = {
  ImportSettings: {
    AutoGenerateTestCases: false,
    ImportAdditionalHeader: false,
    ImportAdditionalTypeCombinatorModels: false,
    ImportTypeCombinatorsWithOnlyOneType: false
  },
  CodeGenSettings: {
    Timeout: 30,
    ValidateRequiredParameters: true,
    AddSingleAuthDeprecatedCode: false,
    EnableGlobalUserAgent: true,
    UserAgent: "{language}-SDK/{version} (OS: {os-info}, Engine: {engine}/{engine-version})",
    EnableLogging: true,
    EnableModelKeywordArgsInRuby: true,
    SymbolizeHashKeysInRuby: true,
    ReturnCompleteHttpResponse: true,
    UserConfigurableRetries: true,
    UseEnumPrefix: false,
    ExtendedAdditionalPropertiesSupport: true,
    EnforceStandardizedCasing: true,
    ControllerPostfix: "Api",
    DoNotSplitWords: ["oauth"]
  }
};
