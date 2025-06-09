export interface BuildConfig {
    readonly GeneratePortal: PortalGenerationConfig
}

export interface PortalGenerationConfig {
    readonly ContentFolder: string;
    readonly ApiSpecPath: string;
    readonly ApiSpecs: string[];
    readonly StaticDirBaseUrl: string;
    TailIncludes: string;
    readonly AddStaticPortalResources: boolean;
}