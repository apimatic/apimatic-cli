import { FilePath } from "../types/file/filePath.js";
import { execa } from "execa";
import os from "os";
import { spawn } from "child_process";

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

  public async openFile(filePath: FilePath): Promise<void> {
    const targetPath = filePath.toString();

    // Determine the command and args without using the shell
    let command: string;
    let args: string[];

    switch (os.platform()) {
      case "win32":
        command = "cmd";
        args = ["/c", "start", "", targetPath];
        break;
      case "darwin":
        command = "open";
        args = [targetPath];
        break;
      default:
        command = "xdg-open";
        args = [targetPath];
        break;
    }

    try {
      const child = spawn(command, args, { stdio: "ignore", detached: true });
      child.unref(); // Let it run without blocking
    } catch {
      // Silently ignore errors
    }
  }
}
