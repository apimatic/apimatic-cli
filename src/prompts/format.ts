import pc from "picocolors";
import { intro as i, outro as o } from '@clack/prompts';
import { ActionResult } from "../actions/action-result.js";
import { Directory } from "../types/file/directory.js";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { FilePath } from "../types/file/filePath.js";

export const format = {
  // Core element types
  var: (text: string) => pc.magenta(`'${text}'`),
  path: (text: DirectoryPath | FilePath) => pc.cyan(`'${text}'`),
  cmd: (cmd: string, ...args: string[]) => `${pc.blueBright(cmd)} ${args.map(arg => pc.dim(arg)).join(" ")}`,
  cmdAlt: (cmd: string, ...args: string[]) => `${pc.blueBright(cmd)} ${args.map(arg => pc.dim(pc.blueBright(arg))).join(" ")}`,
  link: (text: string) => pc.underline(pc.blueBright(text)),
  description: (text: string) => pc.greenBright(`${text}`),
  flag: (name: string, value: string | undefined = undefined) => {
    if (value) {
      const sanitizedValue = value.includes(" ") ? `'${value}'` : value;
      return `${pc.green(`--${name}`)}=${pc.dim(sanitizedValue)}`;
    }
    return `${pc.green(`--${name}`)}`;
  },

  // Common message styles
  success: (text: string) => pc.green(text),
  error: (text: string) => pc.red(text),
  info: (text: string) => pc.cyan(text),

  intro: (text: string) => pc.bgCyan(text),
  outroSuccess: (text: string) => pc.bgGreen(text),
  outroFailure: (text: string) => pc.bgRed(text),
  outroCancelled: (text: string) => pc.bgWhite(pc.blackBright(text)),
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


export interface LeafNode {
  name: string;
  description?: string;
}

export interface TreeNode extends LeafNode {
  items: Array<TreeNode | LeafNode>;
}


export function getTree(
  dir: TreeNode,
  prefix: string = "",
  isLast: boolean = true
): string {
  const pointer = isLast ? "└─ " : "├─ ";
  const folderName = dir.name;
  const description = dir.description ? format.description(dir.description) : "";

  let output = `${prefix}${pointer}${folderName}${description ? " " + description : ""}\n`;

  const items = dir.items;
  const newPrefix = prefix + (isLast ? "   " : "|  ");

  items.forEach((item, index) => {
    const last = index === items.length - 1;

    if ('items' in item) {
      output += getTree(item as TreeNode, newPrefix, last);
    } else {
      const filePointer = last ? "└─ " : "├─ ";
      const fileName = item.name;
      const fileDescription = item.description ? format.description(item.description) : "";
      output += `${newPrefix}${filePointer}${fileName}${fileDescription ? " " + fileDescription : ""}\n`;
    }
  });

  return output;
}


