import { FilePath } from "../types/file/filePath.js";
import { execa } from "execa";

export class LauncherService {

  public async openInEditor(filePath: FilePath): Promise<void> {
    try {
      await execa("code", ["--wait", filePath.toString()]);
    } catch {
      // TODO: check for fallback (start)
      if (process.platform === "win32") {
        await execa("cmd", ["/c", "start", "/wait", "notepad", filePath.toString()], { stdio: "ignore" });
      } else if (process.platform === "darwin") {
        await execa("vim", [filePath.toString()], { stdio: "inherit"});
      }
    }
  }
}
