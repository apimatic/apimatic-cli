export interface ServeFlags {
    readonly port: number,
    readonly folder: string;
    readonly destination: string;
    readonly open: boolean;
    readonly "auth-key": string | undefined;
    readonly "no-reload": boolean;
}

export interface ServePaths {
  readonly sourceDirectoryPath: string;
  readonly destinationDirectoryPath: string;
}
