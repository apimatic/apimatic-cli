export type PortalFolders = {
  main: string;
  temp: string;
};
export type ServePortalParams = {
  folders: PortalFolders;
  port: number;
  configDir: string;
};
