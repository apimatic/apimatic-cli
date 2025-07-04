export type LoginCredentials = {
    email: string;
    password: string;
}

export type SpecFile = {
    localPath: string;
    url: string;
}

export type PortalServerConfig = {
    generatedPortalPath: string;
    targetFolder: string;
    configDir: string;
    authKey: string | null;
    ignoredPaths?: string[];
    port?: number;
    openInBrowser?: boolean;
}