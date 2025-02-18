import cli from "cli-ux";
import * as path from "path";
import * as fs from "fs-extra";
import * as os from "os";
import * as archiver from "archiver";
import * as unzipper from "unzipper";
import * as stripTags from "striptags";
import { PassThrough } from "stream";
import AdmZip = require("adm-zip");

import { loggers, ValidationMessages } from "../types/utils";
import { ApiValidationSummary } from "@apimatic/sdk";

export const unzipFile = (stream: NodeJS.ReadableStream, destination: string) => {
  return new Promise((resolve, reject) => {
    const extractStream = unzipper.Extract({ path: destination });

    stream
      .pipe(extractStream)
      .on("error", (error: Error) => reject(new Error("Error during extraction: " + error.message)));

    extractStream.on("close", () => resolve("Extracted"));
    extractStream.on("error", (error: Error) => reject(new Error("Error during extraction: " + error.message)));
  });
};

export const createTempDirectory = async () => {
  return fs.mkdtempSync(path.join(os.tmpdir(), "apimatic-cli-"));
};

export const clearDirectory = async (folderPath: string) => {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Directory ${folderPath} does not exist`);
  }

  const files = await fs.readdir(folderPath);

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    await deleteFile(filePath);
  }

  await deleteFile(folderPath);
};

export const validationMessagesToJson = (validationMessages: ApiValidationSummary): object => {
  const structuredValidationMessages: { [key: string]: { [key: string]: string[] } } = {
    "Validation Messages": {
      Errors: [],
      Warnings: [],
      Messages: []
    }
  };

  if (validationMessages.errors) {
    validationMessages.errors.forEach((error) => {
      structuredValidationMessages["Validation Messages"]["Errors"].push(replaceHTML(error));
    });
  }
  if (validationMessages.warnings) {
    validationMessages.warnings.forEach((warning) => {
      structuredValidationMessages["Validation Messages"]["Warnings"].push(replaceHTML(warning));
    });
  }
  if (validationMessages.messages) {
    validationMessages.messages.forEach((message) => {
      structuredValidationMessages["Validation Messages"]["Messages"].push(replaceHTML(message));
    });
  }

  return structuredValidationMessages;
};

interface DirectoryNode {
  [key: string]: DirectoryNode | string | null | undefined;
}

const descriptions: { [key: string]: string } = Object.entries({
  "APIMATIC-BUILD.json": "# All configurations for the API portal including programming languages and themes",
  spec: "# A directory containing all your API Definition files",
  content: "# A directory containing custom documentation pages in markdown",
  "content/toc.yml": "# This file controls the structure of the side navigation bar in the API Portal",
  static: "# All static files including images, GIFs and PDFs go here"
}).reduce((acc, [key, value]) => {
  acc[path.normalize(key)] = value;
  return acc;
}, {} as { [key: string]: string });

export const directoryToJson = (dirPath: string, parentPath = ""): DirectoryNode => {
  const directoryStructure: DirectoryNode = {};

  const items = fs.readdirSync(dirPath);
  items.forEach((item) => {
    if (item === ".git") return; // Skip .git directory

    const itemPath = path.join(dirPath, item);
    const relativePath = path.join(parentPath, item);
    const stats = fs.statSync(itemPath);

    if (stats.isDirectory()) {
      const subdirectoryStructure = directoryToJson(itemPath, relativePath);

      const folderName = descriptions[path.normalize(relativePath)]
        ? `${item} : ${descriptions[path.normalize(relativePath)]}`
        : item;

      directoryStructure[folderName] = subdirectoryStructure;
    } else {
      directoryStructure[
        descriptions[path.normalize(relativePath)] ? `${item} : ${descriptions[path.normalize(relativePath)]}` : item
      ] = null;
    }
  });

  return directoryStructure;
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
  } catch (_) {
    return false;
  }
};

export const deleteFile = async (filePath: string) => {
  return await fs.remove(filePath);
};

export const writeFileUsingReadableStream = (stream: NodeJS.ReadableStream, destinationPath: string) => {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(destinationPath);
    stream.pipe(writeStream);
    writeStream.on("close", (error: Error) => {
      if (error) {
        return reject(new Error("Couldn't zip the stream"));
      }
      resolve("Zipped");
    });
  });
};

export const zipDirectoryToStream = async (sourcePath: string): Promise<NodeJS.ReadableStream> => {
  // Check if the directory exists for the user or not
  await fs.ensureDir(sourcePath);

  const archive = archiver("zip");

  return new Promise((resolve, reject) => {
    archive.on("error", (err) => {
      reject(err);
    });

    const passThroughStream = new PassThrough();
    archive.pipe(passThroughStream);

    archive.directory(sourcePath, false);

    archive.finalize().catch(reject);

    resolve(passThroughStream);
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
  await fs.ensureDir(sourcePath);

  const zipPath = path.join(destinationPath, "target.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip");

  return new Promise((resolve, reject) => {
    archive.on("error", (err) => {
      reject(err);
    });

    output.on("error", (err) => {
      reject(err);
    });
    output.on("close", () => {
      resolve(zipPath);
    });

    archive.pipe(output);

    archive.directory(sourcePath, false);

    archive.finalize().catch(reject);
  });
};

type ProgressBar = {
  start: () => void;
  stop: () => void;
  update: (progress: number) => void;
};

// TODO: Instead of making progressBar a static, you should have "startProgress"
// return the instance of the progress bar created, the same way "cli.progress"
// method does.
let progressBar: ProgressBar;

// TODO: I didn't mean to say that we should create a fake progress bar when we
// set the requirements to include progress bar. You should get the download or
// upload progress by tracking how much of the steam has been read/written and
// compare that with the remaining size of the stream (in case of upload, you
// get size from the file size and in case of download, you get it from the
// content-type header). In case the progress can not be calculated, show a
// spinner.
export const startProgress = (title: string) => {
  progressBar = cli.progress({
    format: `${title} | {bar}`,
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591"
  });
  progressBar.start();
  const total = 100;
  let count = 0;

  const iv = setInterval(() => {
    count++;
    progressBar.update(count);
    if (count === total - 1) {
      clearInterval(iv);
    }
  }, 50);
};

export const stopProgress = (isError = false) => {
  if (isError) {
    return progressBar ? progressBar.stop() : null;
  }
  progressBar.update(100);
  return progressBar.stop();
};

export const replaceHTML = (string: string) => {
  // string = string.substring(0, string.indexOf("  "));
  return stripTags(string);
};

export const isJSONParsable = (json: string) => {
  try {
    JSON.parse(json);
    return true;
  } catch (e) {
    return false;
  }
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
    log(`Info: ${replaceHTML(message)}`);
  });
  warnings.forEach((warning) => {
    warn(replaceHTML(warning));
  });
  if (errors.length > 0) {
    error(replaceHTML(singleError));
  }
};

/**
 * Extracts a ZIP file to a specified destination directory.
 *
 * @param zipFilePath Path to the ZIP file.
 * @param destinationDir Path to the destination directory where files will be extracted.
 */
export async function extractZipFile(zipFilePath: string, destinationDir: string): Promise<void> {
  const MAX_ZIP_SIZE = 100 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    try {
      const zip = new AdmZip(zipFilePath);
      const zipEntries = zip.getEntries();
      let totalSize = 0;

      zipEntries.forEach((entry) => {
        totalSize += entry.header.size;

        const normalizedPath = path.normalize(entry.entryName);
        if (normalizedPath.startsWith("..") || path.isAbsolute(normalizedPath)) {
          return reject(new Error(`Blocked potentially unsafe path: ${normalizedPath}`));
        }
      });

      if (totalSize > MAX_ZIP_SIZE) {
        return reject(new Error(getMessageInRedColor("Archive size is too large for safe extraction.")));
      }

      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
      }

      zipEntries.forEach((entry) => {
        const resolvedPath = path.resolve(destinationDir, entry.entryName);

        if (!resolvedPath.startsWith(path.resolve(destinationDir))) {
          throw new Error("An error occurred while extracting zip file.");
        }

        zip.extractEntryTo(entry, destinationDir, true, true);
      });
      resolve();
    } catch (error) {
      console.error("Failed to extract ZIP file:", error);
      reject(error);
    }
  });
}

export async function validateAndZipPortalSource(
  sourceDir: string,
  outputPath: string,
  ignoredPaths: string[] = []
): Promise<string> {
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", {
    zlib: { level: 9 }
  });

  return new Promise((resolve, reject) => {
    output.on("close", () => resolve(outputPath));
    archive.on("error", (err) => reject(err));

    archive.pipe(output);

    // Function to recursively add files and directories to the archive, excluding ignored paths
    const addItemsToArchive = async (currentPath: string, archivePath: string | false) => {
      const items = await fs.readdir(currentPath);

      if (!items.includes('APIMATIC-BUILD.json'))
      {
        throw new Error('Build file is missing, portal cannot be generated.');
      }

      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const relativePath = path.relative(sourceDir, fullPath);

        // Check if the path is ignored.
        const isIgnored = ignoredPaths.some(
          (ignoredPath) =>
            fullPath === ignoredPath ||
            relativePath === ignoredPath ||
            relativePath.startsWith(ignoredPath + "/") ||
            relativePath.startsWith(ignoredPath + "\\")
        );
        if (!isIgnored) {
          const stats = await fs.stat(fullPath);
          if (stats.isDirectory()) {
            await addItemsToArchive(fullPath, archivePath ? path.join(archivePath, item) : item);
          } else {
            archive.file(fullPath, { name: archivePath ? path.join(archivePath, item) : item });
          }
        }
      }
    };

    // Start adding items from the source directory
    addItemsToArchive(sourceDir, false)
      .then(() => {
        archive.finalize();
      })
      .catch(reject);
  });
}
export const getMessageInOrangeColor = (message: string) => {
  return `\u001b[38;2;232;148;64m${message}\u001b[0m`;
};

export const getMessageInBlueColor = (message: string) => {
  return `\u001b[38;2;75;184;253m${message}\u001b[0m`;
};

export const getMessageInCyanColor = (message: string) => {
  return `\u001b[38;2;61;213;231m${message}\u001b[0m`;
};

export const getMessageInGreenColor = (message: string) => {
  return `\u001b[38;2;57;233;168m${message}\u001b[0m`;
};

export const getMessageInMagentaColor = (message: string) => {
  return `\u001b[38;2;225;117;153m${message}\u001b[0m`;
};

export const getMessageInRedColor = (message: string) => {
  return `\u001b[38;2;230;80;41m${message}\u001b[0m`;
};
