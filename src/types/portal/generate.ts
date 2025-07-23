export interface GeneratePortalParams {
  readonly sourceBuildInputZipFilePath: string;
  readonly generatedPortalArtifactsFolderPath: string;
  readonly generatedPortalArtifactsZipFilePath: string;
  readonly overrideAuthKey: string | null;
  readonly generateZipFile: boolean;
};

export interface ErrorResponse {
  readonly title: string;
  readonly detail?: string;
  readonly errors: Record<string, string[]>;
  readonly message?: string;
}
