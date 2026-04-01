import { FilePath } from "../types/file/filePath.js";
import { execa } from "execa";
import os from "os";
import { spawn } from "child_process";
import open from "open";
import { UrlPath } from "../types/file/urlPath.js";
import isInCi from "is-in-ci";
import { DirectoryPath } from "../types/file/directoryPath.js";

export class LauncherService {
  public async openFolderInIde(directoryPath: DirectoryPath, ...filesToOpen: FilePath[]): Promise<boolean> {
    if (isInCi) return false;
    try {
      const args = [directoryPath.toString(), ...filesToOpen.map(f => f.toString())];
      await execa("code", args);
      return true;
    } catch {
      return false;
    }
  }

  public async openDiffsInSourceControl(
    directoryPath: DirectoryPath,
    diffPairs: Array<{ base: FilePath; working: FilePath }>,
    standaloneFiles: FilePath[] = []
  ): Promise<boolean> {
    if (isInCi) return false;
    try {
      const commands = this.buildDiffCommands(directoryPath, diffPairs, standaloneFiles);
      for (const args of commands) {
        await execa("code", args);
      }
      return true;
    } catch {
      return false;
    }
  }

  public async waitForVscodeToClose(directoryPath: DirectoryPath): Promise<boolean> {
    if (isInCi) return false;
    try {
      await execa("code", ["--reuse-window", "--wait", directoryPath.toString()]);
      return true;
    } catch {
      return false;
    }
  }

  private buildDiffCommands(
    directoryPath: DirectoryPath,
    diffPairs: Array<{ base: FilePath; working: FilePath }>,
    standaloneFiles: FilePath[]
  ): string[][] {
    const dir = directoryPath.toString();
    const commands: string[][] = [];

    const [firstDiff, ...remainingDiffs] = diffPairs;
    const [firstFile, ...remainingFiles] = standaloneFiles;

    if (firstDiff) {
      commands.push(["--new-window", dir, "--diff", firstDiff.base.toString(), firstDiff.working.toString()]);
    } else if (firstFile) {
      commands.push(["--new-window", dir, firstFile.toString()]);
    } else {
      commands.push(["--new-window", dir]);
      return commands;
    }

    for (const { base, working } of remainingDiffs) {
      commands.push(["--reuse-window", "--diff", base.toString(), working.toString()]);
    }

    const filesToOpen = firstDiff ? standaloneFiles : remainingFiles;
    for (const file of filesToOpen) {
      commands.push(["--reuse-window", file.toString()]);
    }

    return commands;
  }

  public async openInEditor(filePath: FilePath): Promise<void> {
    if (isInCi) return;
    try {
      await execa("code", ["--wait", filePath.toString()]);
    } catch {
      // TODO: check for fallback (start)
      if (process.platform === "win32") {
        await execa("cmd", ["/c", "start", "/wait", "notepad", filePath.toString()], { stdio: "ignore" });
      } else if (process.platform === "darwin") {
        await execa("vim", [filePath.toString()], { stdio: "inherit" });
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

  public openUrlInBrowser(url: UrlPath) {
    if (isInCi) return;
    try {
      return open(url.toString());
    } catch {
      // Silently ignore errors
    }
  }
}
