export interface ServeFlags {
    readonly port: number,
    readonly folder: string;
    readonly destination: string;
    readonly ignore: string;
    readonly open: boolean;
    readonly "auth-key": string;
    readonly "no-reload": boolean;
}

export interface ServePaths {
  readonly sourceDirectoryPath: string;
  readonly destinationDirectoryPath: string;
  readonly generatedPortalArtifactsDirectoryPath: string;
}