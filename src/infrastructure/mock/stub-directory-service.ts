import fs from 'node:fs/promises';
import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { isStubFileName, loadStubs, StubFile } from '../../types/mock/stub-format/stub-loader.js';
import { StubProblem } from '../../types/mock/stub-format/stub-problem.js';
import { StubSchema } from '../../types/mock/stub-format/stub-schema.js';
import { StubSet } from '../../types/mock/stub-format/stub.js';
import { errorMessage } from '../../utils/error-utils.js';
import { envInfo } from '../env-info.js';

const SCHEMA_FILE_NAME = 'mock-stubs.schema.json';

export class StubDirectoryService {
  /**
   * Loads the stub files at the top of a directory; subfolders are not read. A directory that is
   * missing, is a file or may not be listed is a problem of the directory, so a container running
   * as another user than the one who made the folder gets the report, not a stack trace.
   */
  public async load(directory: DirectoryPath): Promise<Result<StubSet, StubProblem[]>> {
    const schema = await StubDirectoryService.schema();
    if (schema.isErr()) {
      return err([{ file: SCHEMA_FILE_NAME, path: '', message: schema.error }]);
    }
    const names = await StubDirectoryService.stubFileNames(directory);
    if (names.isErr()) {
      return err([{ file: directory.toString(), path: '', message: names.error }]);
    }
    const files = await Promise.all(names.value.map((name) => StubDirectoryService.read(directory, name)));
    return loadStubs(files, schema.value);
  }

  private static async stubFileNames(directory: DirectoryPath): Promise<Result<string[], string>> {
    try {
      if (!(await fs.stat(directory.toString())).isDirectory()) {
        return err('This is a file; the stubs directory is the folder that holds the stub files.');
      }
    } catch {
      return err('The stubs directory does not exist.');
    }
    try {
      const entries = await fs.readdir(directory.toString(), { withFileTypes: true });
      return ok(
        entries.filter((entry) => !entry.isDirectory() && isStubFileName(entry.name)).map((entry) => entry.name)
      );
    } catch (error) {
      return err(`The stubs directory could not be read: ${errorMessage(error)}`);
    }
  }

  private static async read(directory: DirectoryPath, name: string): Promise<StubFile> {
    try {
      return { name, content: ok(await fs.readFile(FilePath.resolve(directory, name).toString())) };
    } catch (error) {
      return { name, content: err(errorMessage(error)) };
    }
  }

  private static async schema(): Promise<Result<StubSchema, string>> {
    const file = FilePath.resolve(envInfo.packageRoot(), SCHEMA_FILE_NAME);
    try {
      return StubSchema.read(JSON.parse(await fs.readFile(file.toString(), 'utf8')));
    } catch (error) {
      return err(`The stub schema could not be read: ${errorMessage(error)}`);
    }
  }
}
