import * as path from "path";
import * as fs from "fs-extra";
import * as chokidar from "chokidar";
import { GeneratePortalParams } from "../../types/portal/generate";

import { exec } from "child_process";

import { downloadDocsPortal } from "./generate";
import { zipDirectory } from "../../utils/utils";
import { ServePortalParams, PortalFolders } from "../../types/portal/serve";

export const serveSourceFolder = async ({ folders, configDir, port }: ServePortalParams): Promise<void> => {
  // Initialize watcher.
  const watcher = chokidar.watch(folders.main, {
    ignored: /(^|[/\\])\../, // ignore dot files
    persistent: true
  });
  await portalChangeHandler(folders, configDir);
  await servePortal(folders.temp, port);
  watcher.on("change", () => portalChangeHandler(folders, configDir));
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
  return console.log("Portal updated, please refresh your browser");
};

const servePortal = async (folder: string, port: number) => {
  console.log("Serving portal at http://localhost:" + port);
  exec(`http-server ${folder} --port ${port} -c-1`, (err) => {
    if (err) {
      throw err;
    }
  });
};
