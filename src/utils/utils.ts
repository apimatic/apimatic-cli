// TODO: Use fs-extra. See comment below.
import * as fs from "fs";
import * as path from "path";
import * as archiver from "archiver";
import * as unzipper from "unzipper";
import cli from "cli-ux";

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

// TODO: You don't need to wrap the file operations with Promises yourself.
// There's a popular library called fs-extra
// (https://www.npmjs.com/package/fs-extra) that provides Promisified variants
// of the file system methods. You should use that instead of using the Node.js
// "fs" library. The same goes for other file system calls in this code base.
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
  const zipPath = path.join(destinationPath, "target.zip");
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

// TODO: Don't use regex to handle HTML. Better to use a proper HTML parser to
// strip HTML from the text. Or use a library that returns text stripped of HTML
// directly.
// PS: Bonus points if you actually figure out how to show formatted
// text on terminal using the HTML tags here instead of just stripping them
// away. Note that this is kind of a pipe dream for me 😁
export const replaceHTML = (string: string) => {
  return string.replace(/<[^>]*>?/gm, "");
};
