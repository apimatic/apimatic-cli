import * as path from "path";
import * as fs from "fs-extra";
import * as chokidar from "chokidar";
import * as bs from "browser-sync";
import { GeneratePortalParams } from "../../types/portal/generate";

import { exec } from "child_process";

// import * as http from "http";
// import * as serveStatic from "serve-static";
import { PortalFolders } from "../../types/portal/serve";
import { zipDirectory } from "../../utils/utils";
import { downloadDocsPortal } from "./generate";

export const serveSourceFolder = async (folders: PortalFolders, configDir: string): Promise<void> => {
  watchSourceFolder(folders, configDir, portalChangeHandler);
};

const portalChangeHandler = async (folders: PortalFolders, configDir: string) => {
  if (!(await fs.pathExists(folders.temp))) {
    await fs.mkdir(folders.temp, { recursive: true });
  }
  const zippedPortalPath: string = path.join(folders.temp, ".zip");
  const zippedBuildFilePath: string = await zipDirectory(folders.main, folders.temp);

  const generatePortalParams: GeneratePortalParams = {
    zippedBuildFilePath,
    portalFolderPath: folders.temp,
    zippedPortalPath,
    overrideAuthKey: "",
    zip: false
  };

  await downloadDocsPortal(generatePortalParams, configDir);
  return console.log("Portal updated");
};

const watchSourceFolder = async (
  folders: PortalFolders,
  configDir: string,
  changeHandler: (folders: PortalFolders, configDir: string) => void
) => {
  // Initialize watcher.
  console.log("Watching for changes in source folder...");
  const watcher = chokidar.watch(folders.main, {
    ignored: /(^|[/\\])\../, // ignore dot files
    persistent: true
  });
  changeHandler(folders, configDir);
  servePortal(folders.temp);
  watcher.on("change", () => changeHandler(folders, configDir));
};

const servePortal = async (folder: string) => {
  const sync: bs.BrowserSyncInstance = bs.create();
  sync.init({
    server: folder
  });
  sync.watch("*.html").on("change", sync.reload);
};
