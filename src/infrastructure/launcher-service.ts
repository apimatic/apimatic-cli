import { FilePath } from "../types/file/filePath.js";
import { execa } from "execa";

export class LauncherService {

  public async openFile(filePath: FilePath): Promise<void> {
    try {
      await execa("code", ["--wait", filePath.toString()]);
    } catch {
      if (process.platform === "win32") {
        await execa("notepad", [filePath.toString()]);
      } else {
        await execa("vim", [filePath.toString()], { stdio: "inherit"});
      }
    }
  }
}
