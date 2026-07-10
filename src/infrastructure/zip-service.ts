import fs from 'fs';
import { Buffer } from 'node:buffer';
import yazl from 'yazl';
import AdmZip from 'adm-zip';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FilePath } from '../types/file/filePath.js';

export class ZipService {
  public async archive(sourceDir: DirectoryPath, outputZipPath: FilePath): Promise<void> {
    return new Promise((resolve, reject) => {
      const zipfile = new yazl.ZipFile();

      const addDirectory = (dir: DirectoryPath, relativePrefix: string) => {
        for (const entry of fs.readdirSync(dir.toString(), { withFileTypes: true })) {
          const fullPath = dir.join(entry.name);
          // Always use forward slashes as metadataPath — zip format requires it
          const metadataPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            addDirectory(fullPath, metadataPath);
          } else {
            zipfile.addFile(fullPath.toString(), metadataPath);
          }
        }
      };

      try {
        addDirectory(sourceDir, '');
      } catch (err) {
        return reject(err);
      }

      zipfile.end();
      const output = fs.createWriteStream(outputZipPath.toString());
      zipfile.outputStream.pipe(output);
      output.on('close', resolve);
      output.on('error', reject);
    });
  }

  /** Reads a single entry's contents from an in-memory zip; undefined if absent. */
  public readEntry(zipData: Buffer, entryName: string): Buffer | undefined {
    return new AdmZip(zipData).getEntry(entryName)?.getData();
  }

  public async unArchive(sourceFile: FilePath, destinationDirectory: DirectoryPath): Promise<void> {
    const MAX_FILES = 100_000;
    const MAX_SIZE = 1_000_000_000; // 1 GB

    // adm-zip extracts synchronously, with no per-entry read streams. This
    // avoids a hang on Node 22+ where yauzl/fd-slicer (used by extract-zip)
    // builds STORED-entry read streams that deliver every byte but never emit
    // `end`, leaving the extraction promise pending forever — even though all
    // files have already been written to disk — which crashes the CLI with
    // "unsettled top-level await" / exit code 13.
    const zip = new AdmZip(sourceFile.toString());
    const entries = zip.getEntries();

    if (entries.length > MAX_FILES) {
      throw new Error('Reached max. file count');
    }
    // header.size is the uncompressed size declared in the zip headers, so it
    // might not be trustworthy — kept as a cheap guard against zip bombs.
    let totalSize = 0;
    for (const entry of entries) {
      totalSize += entry.header.size;
      if (totalSize > MAX_SIZE) {
        throw new Error('Reached max. size');
      }
    }

    zip.extractAllTo(destinationDirectory.toString(), /* overwrite */ true);
  }
}
