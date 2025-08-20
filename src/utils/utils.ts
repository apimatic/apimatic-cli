import * as path from "path";
import fs from "fs";
import fsExtra from "fs-extra";
import os from "os";
import { URL } from "url";
import { Buffer } from "buffer";
import archiver from "archiver";
import stripTags from "striptags";
import colors from "picocolors";

import { loggers, ValidationMessages } from "../types/utils.js";

export const createTempDirectory = async () => {
  return fs.mkdtempSync(path.join(os.tmpdir(), "apimatic-cli-"));
};

export const isValidUrl = (input: string): boolean => {
  if (!input) {
    return false;
  }

  try {
    const url = new URL(input);

    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    if (url.protocol === "file:" || fs.existsSync(input)) {
      return false;
    }

    if (!url.host) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

export const deleteFile = async (filePath: string) => {
  return await fsExtra.remove(filePath);
};

export const writeFileUsingReadableStream = (stream: NodeJS.ReadableStream, destinationPath: string) => {
  return new Promise((resolve) => {
    const writeStream = fs.createWriteStream(destinationPath);
    stream.pipe(writeStream);
    writeStream.on("close", () => {
      resolve("Zipped");
    });
  });
};

/**
 * Packages local files into a ZIP archive
 *
 * @param {docsPortalFolderPath} path to portal directory.
 * @param {destinationZipPath} path to generated zip
 * return {string}
 */
export const zipDirectory = async (sourcePath: string, destinationPath: string): Promise<string> => {
  // Check if the directory exists for the user or not
  await fsExtra.ensureDir(sourcePath);

  const zipPath = path.join(destinationPath, ".target.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip");

  return new Promise((resolve, reject) => {
    archive.on("error", (err: Error) => {
      reject(new Error(err.message));
    });

    output.on("error", (err) => {
      reject(new Error(err.message));
    });
    output.on("close", () => {
      resolve(zipPath);
    });

    archive.pipe(output);

    archive.directory(sourcePath, false);

    archive.finalize().catch(reject);
  });
};

export const replaceHTML = (string: string) => {
  return stripTags(string);
};

export const getFileNameFromPath = (filePath: string) => {
  return path.basename(filePath).split(".")[0];
};

export const printValidationMessages = (
  { warnings, errors, messages }: ValidationMessages,
  { log, warn, error }: loggers
) => {
  warnings = warnings || [];
  messages = messages || [];
  const singleError: string = errors.join("\n") || "";

  messages.forEach((message) => {
    log(`\nInfo: ${replaceHTML(message)}`);
  });
  warnings.forEach((warning) => {
    warn(replaceHTML(warning));
  });
  if (errors.length > 0) {
    error(replaceHTML(singleError));
  }
};

export async function parseStreamBodyToJson(body: NodeJS.ReadableStream): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  return JSON.parse(text);
}

export const getMessageInOrangeColor = (message: string) => {
  return colors.yellow(message);
};

export const getMessageInBlueColor = (message: string) => {
  return colors.blueBright(message);
};

export const getMessageInCyanColor = (message: string) => {
  return colors.cyan(message);
};

export const getMessageInGreenColor = (message: string) => {
  return colors.greenBright(message);
};

export const getMessageInMagentaColor = (message: string) => {
  return colors.magentaBright(message);
};

export const getMessageInRedColor = (message: string) => {
  return colors.redBright(message);
};
