import * as path from "path";
import net from "net";
import fs from "fs-extra";
import os from "os";
import archiver from "archiver";
import unzipper from "unzipper";
import stripTags from "striptags";
import AdmZip from "adm-zip";
import colors from "picocolors";
import { PassThrough } from "stream";

import { loggers, ValidationMessages } from "../types/utils.js";
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

// TODO: Move to types folder.
interface DirectoryNode {
  [key: string]: DirectoryNode | string | null | undefined;
}

// TODO: Move to portal:quickstart command.
const descriptions: { [key: string]: string } = Object.entries({
  "APIMATIC-BUILD.json": "# Defines all configurations for the API portal, including programming languages and themes",
  spec: "# Contains all API definition files",
  content: "# Includes custom documentation pages in Markdown",
  "content/toc.yml": "# Controls the structure of the side navigation bar in the API portal",
  static: "# Includes all static files, such as images, GIFs, and PDFs"
}).reduce((acc, [key, value]) => {
  acc[path.normalize(key)] = value;
  return acc;
}, {} as { [key: string]: string });

// TODO: Move to portal:quickstart command.
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
  return new Promise((resolve) => {
    const writeStream = fs.createWriteStream(destinationPath);
    stream.pipe(writeStream);
    writeStream.on("close", () => {
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
      reject(new Error(err.message));
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

  const zipPath = path.join(destinationPath, ".target.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip");

  return new Promise((resolve, reject) => {
    archive.on("error", (err) => {
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

export const isJSONParsable = (json: string) => {
  try {
    JSON.parse(json);
    return true;
  } catch (e) {
    return false;
  }
};

export const getGeneratedFilesPaths = (
  sourceDirectoryPath: string,
  generatedPortalArtifactsDirectoryPath: string
): string[] => {
  const generatedBuildInputZipPath = path.join(sourceDirectoryPath, ".portal_source.zip");
  const generatedPortalArtifactsZipFilePath = path.join(sourceDirectoryPath, ".generated_portal.zip");
  const generatedPortalArtifactsFolderPath = path.join(
    path.dirname(generatedPortalArtifactsDirectoryPath),
    "generated_portal"
  );

  return [generatedBuildInputZipPath, generatedPortalArtifactsFolderPath, generatedPortalArtifactsZipFilePath];
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
  const MAX_ZIP_SIZE = 300 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    try {
      const zip = new AdmZip(zipFilePath);
      const zipEntries = zip.getEntries();
      let totalSize = 0;

      zipEntries.forEach((entry) => {
        totalSize += entry.getData().length;

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
          return reject(new Error("An error occurred while extracting zip file."));
        }

        zip.extractEntryTo(entry, destinationDir, true, true);
      });
      resolve();
    } catch (error) {
      return reject(new Error(`Failed to extract ZIP File: ${error}`));
    }
  });
}

export async function validateAndZipPortalSource(
  sourceDir: string,
  outputPath: string,
  ignoredPaths: string[] = []
): Promise<string> {
  
  if (await fs.pathExists(outputPath)){
    await deleteFile(outputPath);
  }

  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", {
    zlib: { level: 9 }
  });

  return new Promise((resolve, reject) => {
    output.on("close", () => resolve(outputPath));
    output.on("error", (err) => {
      return reject(new Error(`Failed to zip the source directory: ${err.message}`));
    });
    archive.on("error", (err) => {
      return reject(new Error(`Failed to zip the source directory: ${err.message}`));
    });

    archive.pipe(output);

    // Function to recursively add files and directories to the archive, excluding ignored paths
    const addItemsToArchive = async (currentPath: string, archivePath: string | false) => {
      const items = await fs.readdir(currentPath);

      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const relativePath = path.relative(sourceDir, fullPath);

        // Check if the path is ignored.
        const isIgnored = ignoredPaths.some(
          (ignoredPath) =>
            fullPath === ignoredPath ||
            relativePath === ignoredPath ||
            fullPath === path.resolve(ignoredPath) ||
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
      .catch((err) => {
        return reject(new Error(`Failed to add items to the zip created for source directory: ${err.message}`));
      });
  });
}

export async function cleanUpGeneratedPortalFiles(sourceDir: string) {
  const generatedPortalZipFilePath = path.join(sourceDir, ".generated_portal.zip");
  const generatedPortalSourceZipFilePath = path.join(sourceDir, ".portal_source.zip");
  if (fs.existsSync(generatedPortalZipFilePath)) {
    await deleteFile(generatedPortalZipFilePath);
  }
  if (fs.existsSync(generatedPortalSourceZipFilePath)) {
    await deleteFile(generatedPortalSourceZipFilePath);
  }
}

export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    server.once("listening", () => {
      server.close();
      resolve(false);
    });

    server.listen(port);
  });
}

export async function parseStreamBodyToJson(body: NodeJS.ReadableStream): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  return JSON.parse(text);
}

export const getNonHiddenItemsFromDirectory = (directoryPath: string): string[] => {
  return fs.readdirSync(directoryPath).filter((item) => !item.startsWith("."));
};

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
