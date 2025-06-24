export interface GeneratePortalParams {
  readonly sourceBuildInputZipFilePath: string;
  readonly generatedPortalArtifactsFolderPath: string;
  readonly generatedPortalArtifactsZipFilePath: string;
  readonly overrideAuthKey: string | null;
  readonly generateZipFile: boolean;
};

export interface PortalPaths {
  readonly sourceFolderPath: string;
  readonly destinationFolderPath: string;
  readonly generatedPortalArtifactsFolderPath: string;
  readonly generatedPortalArtifactsZipFilePath: string;
}

export interface ErrorResponse {
  readonly title: string;
  readonly detail?: string;
  readonly errors: Record<string, string[]>;
  readonly message?: string;
}

export interface GenerateFlags {
  readonly folder: string;
  readonly destination: string;
  readonly force: boolean;
  readonly zip: boolean;
  readonly "auth-key": string;
}