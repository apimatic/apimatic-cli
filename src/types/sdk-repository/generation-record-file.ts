import { FileService } from '../../infrastructure/file-service.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { GenerationRecord, RECORD_ATTRIBUTES, RECORD_DIRECTORY, RECORD_FILE } from '../sdk/generation-record.js';

const RECORD_ATTRIBUTES_FILE = '.gitattributes';

/** `<sdk>/.apimatic/generation.json`, with the attributes file beside it that keeps git from writing markers into it. */
export class GenerationRecordFile {
  private readonly fileService = new FileService();

  constructor(private readonly sdk: DirectoryPath) {}

  private get file(): FilePath {
    return new FilePath(RECORD_DIRECTORY.in(this.sdk), new FileName(RECORD_FILE));
  }

  private get attributes(): FilePath {
    return new FilePath(RECORD_DIRECTORY.in(this.sdk), new FileName(RECORD_ATTRIBUTES_FILE));
  }

  /** The record, or none when there is no file, or not one a CLI wrote. */
  public async read(): Promise<GenerationRecord | undefined> {
    if (!(await this.fileService.fileExists(this.file))) {
      return undefined;
    }
    return GenerationRecord.parse(await this.fileService.getContents(this.file));
  }

  /** Both files, each only when its content changed, so a regeneration that changed nothing touches neither. */
  public async write(record: GenerationRecord): Promise<void> {
    await this.fileService.replaceContentsIfChanged(this.attributes, RECORD_ATTRIBUTES);
    await this.fileService.replaceContentsIfChanged(this.file, record.toJson());
  }
}
