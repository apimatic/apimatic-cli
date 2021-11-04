import * as fs from "fs";
import cli from "cli-ux";

import * as archiver from "archiver";
import * as unzipper from "unzipper";

export const unzipFile = (source: string, destination: string) => {
  return new Promise((resolve, reject) => {
    const readStream: fs.ReadStream = fs.createReadStream(source);

    readStream.pipe(unzipper.Extract({ path: destination }));
    readStream.on("close", (error: Error) => {
      if (error) {
        reject(new Error("Couldn't extract the zip"));
      }
      resolve("Extracted");
    });
  });
};

export const deleteFile = (filePath: string) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (error: NodeJS.ErrnoException | null) => {
      if (error) {
        reject(new Error(error.code));
      }
      resolve("Deleted");
    });
  });
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
  // Check if the directory exists for the user or not
  if (!fs.existsSync(sourcePath)) {
    throw new Error("Folder to zip doesn't exist");
  }
  const zipPath = `${destinationPath}/target.zip`;
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip");

  archive.on("error", (err) => {
    throw err;
  });

  archive.pipe(output);

  // append files from a sub-directory, putting its contents at the root of archive
  archive.directory(sourcePath, false);

  await archive.finalize();
  return zipPath;
};

type ProgressBar = {
  start: () => {};
  stop: () => {};
  update: (progress: number) => {};
};

let progressBar: ProgressBar;

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
    if (count === total) {
      clearInterval(iv);
    }
  }, 50);
};

export const stopProgress = () => {
  progressBar.update(100);
  progressBar.stop();
};

export const replaceHTML = (string: string) => {
  return string.replace(/<[^>]*>?/gm, "");
};
