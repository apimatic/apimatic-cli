import fs from 'fs';
import yazl from 'yazl';
import AdmZip from 'adm-zip';
import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { errorMessage } from '../utils/error-utils.js';

type ZipEntry = { file: FilePath; metadataPath: string };

export class ZipService {
  public async archive(sourceDir: DirectoryPath, outputZipPath: FilePath): Promise<Result<void, string>> {
    try {
      await this.write(sourceDir, outputZipPath);
      return ok(undefined);
    } catch (error) {
      await fs.promises.rm(outputZipPath.toString(), { force: true }).catch(() => undefined);
      return err(errorMessage(error));
    }
  }

  public async unArchive(sourceFile: FilePath, destinationDirectory: DirectoryPath): Promise<Result<void, string>> {
    try {
      this.extract(sourceFile, destinationDirectory);
      return ok(undefined);
    } catch (error) {
      return err(errorMessage(error));
    }
  }

  private async write(sourceDir: DirectoryPath, outputZipPath: FilePath): Promise<void> {
    const entries = this.entriesUnder(sourceDir, '');
    const zipfile = new yazl.ZipFile();

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputZipPath.toString());
      zipfile.on('error', (error: Error) => output.destroy(error));
      output.on('error', reject);
      output.on('close', resolve);
      zipfile.outputStream.pipe(output);
      for (const { file, metadataPath } of entries) {
        zipfile.addFile(file.toString(), metadataPath);
      }
      zipfile.end();
    });
  }

  private entriesUnder(dir: DirectoryPath, relativePrefix: string): ZipEntry[] {
    return fs.readdirSync(dir.toString(), { withFileTypes: true }).flatMap((entry) => {
      // Always use forward slashes as metadataPath — zip format requires it
      const metadataPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      return entry.isDirectory()
        ? this.entriesUnder(dir.join(entry.name), metadataPath)
        : [{ file: new FilePath(dir, new FileName(entry.name)), metadataPath }];
    });
  }

  private extract(sourceFile: FilePath, destinationDirectory: DirectoryPath) {
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
