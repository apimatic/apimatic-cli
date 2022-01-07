import cli from "cli-ux";
import * as path from "path";
import * as fs from "fs-extra";
import * as archiver from "archiver";
import * as unzipper from "unzipper";
import * as stripTags from "striptags";

import { loggers, Paths, ValidationMessages } from "../types/utils";

export const unzipFile = (stream: NodeJS.ReadableStream, destination: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    stream.pipe(unzipper.Extract({ path: destination }));
    stream.on("close", (error: Error) => {
      if (error) {
        reject(new Error("Couldn't extract the zip"));
      }
      resolve();
    });
  });
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

/**
 * Packages local files into a ZIP archive
 *
 * @param {docsPortalFolderPath} path to portal directory.
 * @param {destinationZipPath} path to generated zip
 * return {string}
 */
export const zipDirectory = async (sourcePath: string, destinationPath: string) => {
  cli.action.start("Zipping folder");

  if (sourcePath === destinationPath) {
    throw new Error("Source and destination paths can't be the same");
  }
  // Check if the directory exists for the user or not
  await fs.ensureDir(sourcePath);

  const zipPath = path.join(destinationPath, "target.zip");

  if (await fs.pathExists(zipPath)) {
    await deleteFile(zipPath);
  }
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip");

  archive.on("error", (err) => {
    throw err;
  });

  archive.pipe(output);

  // append files from a sub-directory, putting its contents at the root of archive
  archive.directory(sourcePath, false);

  await archive.finalize();
  cli.action.stop();
  return zipPath;
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

export const getFileNameFromFlags = ({ file, url, "api-entity": apiEntityId }: Paths) => {
  return apiEntityId
    ? path.basename(apiEntityId).split(".")[0]
    : file
    ? path.basename(file).split(".")[0]
    : path.basename(url).split(".")[0];
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
