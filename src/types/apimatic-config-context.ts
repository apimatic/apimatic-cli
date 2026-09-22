import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { errorMessage } from '../utils/error-utils.js';
import {
  APIMATIC_CONFIG_FILE_NAME,
  ApimaticConfigDocument,
  ConfigBlockName,
  ConfigFinding
} from './apimatic-config/document.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';

/**
 * What a reader finds. `path` rides along purely so a prompt can say where to fix the file.
 * A parsed document may still carry findings; each command reads the blocks it owns.
 */
export type ApimaticConfigState =
  | { state: 'missing' }
  | { state: 'unparseable'; findings: ConfigFinding[]; path: FilePath }
  | { state: 'parsed'; document: ApimaticConfigDocument; path: FilePath };

export type ApimaticConfigWriteFailure = 'unreadable' | 'unwritable';

interface Format {
  indent: string;
  trailingNewline: boolean;
}

/** How a file the CLI creates is laid out; one it found keeps its own layout. */
const DEFAULT_FORMAT: Format = { indent: '  ', trailingNewline: true };

interface Loaded {
  parsed: Result<ApimaticConfigDocument, ConfigFinding[]>;
  format: Format;
}

/** The `apimatic.json` at the root of an input directory, beside `src/`. */
export class ApimaticConfigContext {
  private readonly fileService = new FileService();

  constructor(private readonly inputDirectory: DirectoryPath) {}

  private get configFile(): FilePath {
    return new FilePath(this.inputDirectory, new FileName(APIMATIC_CONFIG_FILE_NAME));
  }

  public async exists(): Promise<boolean> {
    return await this.fileService.fileExists(this.configFile);
  }

  public async read(): Promise<ApimaticConfigState> {
    const loaded = await this.load();
    if (loaded === undefined) {
      return { state: 'missing' };
    }
    if (loaded.parsed.isErr()) {
      return { state: 'unparseable', findings: loaded.parsed.error, path: this.configFile };
    }
    return { state: 'parsed', document: loaded.parsed.value, path: this.configFile };
  }

  /**
   * Reads the document, hands the whole of it to `apply`, writes back the whole of what comes
   * back. `blocks` names what the caller is about to write: a finding in one of them, or at
   * the root, refuses the write, so a merge never spreads a malformed block into the file. A
   * missing file starts from the empty document. A file that exists but cannot be parsed is
   * left alone rather than overwritten, and a write fault is reported rather than thrown: this
   * runs after work that already succeeded, and nothing here may turn that into a crash.
   */
  public async merge(
    blocks: readonly ConfigBlockName[],
    apply: (document: ApimaticConfigDocument) => ApimaticConfigDocument
  ): Promise<Result<ApimaticConfigDocument, ApimaticConfigWriteFailure>> {
    const loaded = await this.load();
    let document = ApimaticConfigDocument.empty();
    let format = DEFAULT_FORMAT;
    if (loaded !== undefined) {
      if (loaded.parsed.isErr()) {
        return err('unreadable');
      }
      document = loaded.parsed.value;
      if (document.findingsFor('root', ...blocks).length > 0) {
        return err('unreadable');
      }
      format = loaded.format;
    }

    const next = apply(document);
    try {
      await this.fileService.replaceContents(this.configFile, next.serialize(format.indent, format.trailingNewline));
    } catch {
      return err('unwritable');
    }
    return ok(next);
  }

  private async load(): Promise<Loaded | undefined> {
    if (!(await this.fileService.fileExists(this.configFile))) {
      return undefined;
    }
    let text: string;
    try {
      text = await this.fileService.getContents(this.configFile);
    } catch (error) {
      return {
        parsed: err([{ block: 'root', field: null, problem: `could not be read: ${errorMessage(error)}` }]),
        format: DEFAULT_FORMAT
      };
    }
    return { parsed: ApimaticConfigDocument.parse(text), format: ApimaticConfigContext.detectFormat(text) };
  }

  // The first indented line says how the file is indented; a file with none gets the default.
  // Line endings are not kept: the output is `\n` whatever the file used.
  private static detectFormat(text: string): Format {
    const indent = /^([ \t]+)"/m.exec(text)?.[1] ?? DEFAULT_FORMAT.indent;
    return { indent, trailingNewline: text.endsWith('\n') };
  }
}
