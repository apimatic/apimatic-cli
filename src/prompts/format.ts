import pc from "picocolors";
import { Result } from "neverthrow";
import { intro as i, outro as o, spinner } from '@clack/prompts';
import { ActionResult } from "../actions/action-result.js";
import { Directory } from "../types/file/directory.js";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { FilePath } from "../types/file/filePath.js";

export const format = {
  // Core element types
  var: (text: string) => pc.magenta(`'${text}'`),
  path: (text: DirectoryPath | FilePath) => pc.cyan(`'${text}'`),
  cmd: (cmd: string, ...args: string[]) => `${pc.blue(cmd)} ${args.map(arg => pc.dim(arg)).join(" ")}`,
  link: (text: string) => pc.underline(pc.blue(text)),
  description: (text: string) => pc.greenBright(`${text}`), // TODO: merge with Saeed's implementation
  flag: (name: string, value: string | undefined = undefined) => {
    if (value) {
      return `${pc.green(`--${name}`)}=${pc.dim(value)}`;
    }
    return `${pc.green(`--${name}`)}`;
  },

  // Common message styles
  success: (text: string) => pc.green(text),
  warning: (text: string) => pc.yellow(text),
  error: (text: string) => pc.red(text),
  info: (text: string) => pc.cyan(text),

  intro: (text: string) => pc.bgCyan(text),
  outroSuccess: (text: string) => pc.bgGreen(text),
  outroFailure: (text: string) => pc.bgRed(text),
  outroCancelled: (text: string) => pc.bgWhite(text)
};

export function intro(text: string) {
  i(format.intro(` ${text} `));
}

export function outro(result: ActionResult) {
  const exitCode = result.getExitCode();
  const message = result.getMessage();
  const outroMessage = result.mapAll(
    () => format.outroSuccess(message),
    () => format.outroFailure(message),
    () => format.outroCancelled(message)
  );
  o(outroMessage);
  process.exitCode = exitCode;
}

export async function withSpinner<T, E>(intro: string, success: string, failure: string, fn: Promise<Result<T, E>>) {
  const s = spinner({
    cancelMessage: "cancelled",
    errorMessage: "failed",
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  });
  s.start(intro);
  const result = await fn;
  result.match(
    () => s.stop(success, 0),
    () => s.stop(failure, 1)
  );
  return result;
}

export function getDirectoryTree(dir: Directory, prefix: string = "", isLast: boolean = true): string {
  const folderDescription: Record<string, string> = {
    spec: "# Contains all API definition files",
    content: "# Includes custom documentation pages in Markdown",
    static: "# Includes all static files, such as images, GIFs, and PDFs"
  };

  const fileDescriptions: Record<string, string> = {
    "toc.yml": "# Controls the structure of the side navigation bar in the API portal",
    "APIMATIC-BUILD.json": "# Defines all configurations for the API portal, including programming languages and themes"
  };

  const pointer = isLast ? "└─ " : "├─ ";
  const folderName = dir.directoryPath.leafName();
  const description = folderDescription[folderName] ? format.description(folderDescription[folderName]) : "";
  let output = `${prefix}${pointer}${folderName}${description ? " " + description : ""}\n`;

  const items = dir.items;
  const newPrefix = prefix + (isLast ? "   " : "|  ");

  items.forEach((item, index) => {
    const last = index === items.length - 1;

    if (item instanceof Directory) {
      output += getDirectoryTree(item, newPrefix, last);
    } else {
      const filePointer = last ? "└─ " : "├─ ";
      const fileName = item.toString();
      const fileDescription = fileDescriptions[fileName] ? format.description(fileDescriptions[fileName]) : "";
      output += `${newPrefix}${filePointer}${fileName}${fileDescription ? " " + fileDescription : ""}\n`;
    }
  });

  return output;
}
