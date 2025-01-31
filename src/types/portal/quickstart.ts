export type LoginCredentials = {
    email: string;
    password: string;
}

export type SpecFile = {
    filePath: string;
    url: string;
}

export type PortalServerConfig = {
    generatedPortalPath: string;
    targetFolder: string;
    configDir: string;
    authKey: string | null;
}