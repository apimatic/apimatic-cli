export interface ServeFlags {
    readonly port: number | undefined,
    readonly input: string;
    readonly destination: string;
    readonly open: boolean;
    readonly "auth-key": string | undefined;
    readonly "no-reload": boolean;
}

export interface ServePaths {
  readonly sourceDirectoryPath: string;
  readonly destinationDirectoryPath: string;
}
