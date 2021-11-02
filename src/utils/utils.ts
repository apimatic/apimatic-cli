import archiver = require("archiver");
import * as fs from "fs";
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

export const writeZipUsingReadableStream = (stream: NodeJS.ReadableStream, destinationPath: string) => {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(destinationPath);
    stream.pipe(writeStream);
    writeStream.on("close", (error: Error) => {
      if (error) {
        reject(new Error("Couldn't zip the stream"));
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
